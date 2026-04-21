import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import mongoose from 'mongoose';
import {
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  closeAllContexts,
} from '../src/shared/lib/multi-session';
import { Account } from '../src/shared/models/account';

const CAFE_ID = '25636798';
const ARTICLE_ID = 31308;
const ACCOUNT_ID = 'heavyzebra240';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const acc = await Account.findOne({ accountId: ACCOUNT_ID }).lean();
  if (!acc) throw new Error('account not found');

  await acquireAccountLock(ACCOUNT_ID);
  try {
    const ok = await isAccountLoggedIn(ACCOUNT_ID);
    if (!ok) {
      const r = await loginAccount(ACCOUNT_ID, acc.password);
      if (!r.success) throw new Error(`login fail: ${r.error}`);
    }

    const page = await getPageForAccount(ACCOUNT_ID);
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${ARTICLE_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 댓글 조회 API
    const data = await page.evaluate(async (args: { cafeId: string; articleId: number }) => {
      const url = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${args.cafeId}/articles/${args.articleId}/comments/pages/1?orderBy=asc&pageSize=100&requestFrom=A`;
      const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) return { error: `${res.status}` };
      return res.json();
    }, { cafeId: CAFE_ID, articleId: ARTICLE_ID });
    console.log('=== API comments ===');
    const items = data?.result?.comments?.items || [];
    console.log('total:', items.length);
    for (const c of items.slice(0, 5)) {
      console.log({ commentId: c.commentId, id: c.id, nick: c.writer?.nick, memberKey: c.writer?.memberKey, content: (c.content || '').slice(0, 30), isWriter: c.isArticleWriter, isMemberMine: c.writer?.isCurrent });
    }

    // DOM 셀렉터 진단
    const dom = await page.evaluate(() => {
      const all = document.querySelectorAll('.CommentItem');
      const classesOnFirst = Array.from(all).slice(0, 5).map(el => el.className);
      const mineSelectors: Record<string, number> = {
        '.CommentItem--mine': document.querySelectorAll('.CommentItem--mine').length,
        '[class*="mine"]': document.querySelectorAll('[class*="mine"]').length,
        '.comment_own': document.querySelectorAll('.comment_own').length,
        '.CommentItem.mine': document.querySelectorAll('.CommentItem.mine').length,
      };
      return { total: all.length, classesOnFirst, mineSelectors };
    });
    console.log('=== DOM ===');
    console.log(JSON.stringify(dom, null, 2));

  } finally {
    await releaseAccountLock(ACCOUNT_ID);
  }
  await closeAllContexts();
  await mongoose.disconnect();
};

main().catch(e => { console.error(e); process.exit(1); });
