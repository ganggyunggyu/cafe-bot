import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
} from '../src/shared/lib/multi-session';

const CAFES: Record<string, string> = {
  '25460974': 'shoppingtpw',
  '25729954': 'shopjirmsin',
};

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db!;

  // DB에서 댓글 있는 최근 글 찾기
  const recentArticle = await db.collection('publishedarticles').findOne(
    { commentCount: { $gt: 0 } },
    { sort: { createdAt: -1 } }
  );
  if (!recentArticle) throw new Error('DB에 댓글 있는 글 없음');

  const cafeId = recentArticle.cafeId as string;
  const articleId = recentArticle.articleId as number;
  const cafeUrl = CAFES[cafeId] || cafeId;
  const target = { articleId, cafeUrl, commentCount: recentArticle.commentCount };
  console.log(`DB 글: #${articleId} cafeId=${cafeId} (댓글 ${recentArticle.commentCount}개)`);

  const user = await User.findOne({ loginId: '21lab', isActive: true }).lean();
  if (!user) throw new Error('user not found');

  const acc = await Account.findOne({ userId: user.userId, isActive: true }).lean();
  if (!acc) throw new Error('no account');

  await acquireAccountLock(acc.accountId);
  const loggedIn = await isAccountLoggedIn(acc.accountId);
  if (!loggedIn) await loginAccount(acc.accountId, acc.password);

  const page = await getPageForAccount(acc.accountId);

  console.log(`\n접속 글: #${target.articleId} (댓글 ${target.commentCount}개)\n`);

  // 글 접속
  const articleUrl = `https://cafe.naver.com/${target.cafeUrl}/${target.articleId}`;
  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // iframe or page
  let root: any = page;
  const frameHandle = await page.$('iframe#cafe_main');
  if (frameHandle) {
    const frame = await frameHandle.contentFrame();
    if (frame) root = frame;
  }

  await root.waitForSelector('.CommentItem', { timeout: 10000 }).catch(() => {});

  // CommentItem HTML 구조 덤프
  const commentData = await root.evaluate(() => {
    const items = document.querySelectorAll('.CommentItem:not(.CommentItem--reply)');
    return Array.from(items).slice(0, 5).map((el, i) => {
      const allAttrs: Record<string, string> = {};
      for (const attr of Array.from(el.attributes)) {
        allAttrs[attr.name] = attr.value;
      }

      // 자식 요소 중 id/data-* 속성 있는 것들
      const interestingChildren: Array<{ tag: string; attrs: Record<string, string> }> = [];
      el.querySelectorAll('[id], [data-cid], [data-comment-id], [data-comment-no]').forEach((child) => {
        const childAttrs: Record<string, string> = {};
        for (const attr of Array.from(child.attributes)) {
          if (attr.name === 'id' || attr.name.startsWith('data-')) {
            childAttrs[attr.name] = attr.value;
          }
        }
        interestingChildren.push({ tag: child.tagName.toLowerCase(), attrs: childAttrs });
      });

      const nickname = el.querySelector('.comment_nickname')?.textContent?.trim() || '';
      const content = el.querySelector('.comment_text_view')?.textContent?.trim().slice(0, 40) || '';

      return {
        index: i,
        nickname,
        content,
        ownAttrs: allAttrs,
        children: interestingChildren.slice(0, 10),
        outerHTMLPreview: el.outerHTML.slice(0, 500),
      };
    });
  });

  for (const item of commentData) {
    console.log(`\n━━━ CommentItem[${item.index}] "${item.nickname}" "${item.content}" ━━━`);
    console.log('자체 attributes:', JSON.stringify(item.ownAttrs, null, 2));
    console.log('id/data-* 자식:');
    for (const child of item.children) {
      console.log(`  <${child.tag}>`, JSON.stringify(child.attrs));
    }
    console.log('\nHTML 미리보기:');
    console.log(item.outerHTMLPreview);
  }

  releaseAccountLock(acc.accountId);
  await mongoose.disconnect();
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
