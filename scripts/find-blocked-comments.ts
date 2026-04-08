/**
 * 벤타쿠 최근 게시글 중 댓글 차단된 글 찾기 (+ 방금 연 4건 되돌리기)
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  closeAllContexts,
} from '../src/shared/lib/multi-session';

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = '31642514';
const LOGIN_ID = 'qwzx16';
const REVERT_ARTICLES = [770, 764, 760, 754];

const toggleComment = async (
  accountId: string,
  password: string,
  articleId: number,
  enable: boolean
): Promise<boolean> => {
  await acquireAccountLock(accountId);
  try {
    const loggedIn = await isAccountLoggedIn(accountId);
    if (!loggedIn) {
      const r = await loginAccount(accountId, password);
      if (!r.success) {
        console.log(`  ❌ 로그인 실패: ${r.error}`);
        return false;
      }
    }
    const page = await getPageForAccount(accountId);
    await page.goto(
      `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${articleId}/modify`,
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    );
    try {
      await page.waitForSelector('#coment', { timeout: 15000 });
    } catch {
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

    const cb = await page.$('#coment');
    if (!cb) return false;

    const checked = await cb.evaluate((el) => (el as HTMLInputElement).checked);
    if (checked === enable) {
      console.log(`  #${articleId} 이미 ${enable ? '허용' : '차단'} 상태`);
      return true;
    }

    const label = await page.$('label[for="coment"]');
    if (label) await label.click();
    else await cb.click();
    await page.waitForTimeout(500);

    const btn = await page.$('a.BaseButton--skinGreen, a.BaseButton');
    if (!btn) return false;
    await btn.click();

    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
    } catch {
      await page.waitForTimeout(3000);
    }

    console.log(`  #${articleId} 댓글 ${enable ? '허용' : '차단'} 완료`);
    await saveCookiesForAccount(accountId);
    return true;
  } finally {
    releaseAccountLock(accountId);
  }
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const writerAccounts = accounts.filter((a) => a.role === 'writer');

  // 1단계: 되돌리기
  if (REVERT_ARTICLES.length > 0) {
    console.log('=== 되돌리기 (댓글 다시 차단) ===');
    const writer = writerAccounts.find((a) => a.accountId === 'akepzkthf12');
    if (writer) {
      for (const articleId of REVERT_ARTICLES) {
        await toggleComment(writer.accountId, writer.password, articleId, false);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    console.log('되돌리기 완료\n');
  }

  // 2단계: commenter 계정으로 최근 글 체크
  console.log('=== 최근 글 20개 댓글 차단 체크 ===');
  const checker = accounts.find((a) => a.role === 'commenter');
  if (!checker) throw new Error('commenter 계정 없음');

  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const r = await loginAccount(checker.accountId, checker.password);
      if (!r.success) throw new Error(`로그인 실패: ${r.error}`);
    }

    const page = await getPageForAccount(checker.accountId);
    await page.goto(`https://cafe.naver.com/btaku`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    const listApiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${CAFE_ID}&search.page=1&search.perPage=20&search.queryType=lastArticle&search.boardtype=L`;

    const listResult = await page.evaluate(async (url: string) => {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, listApiUrl);

    if (listResult.error) throw new Error(`글 목록 API 오류: ${listResult.error}`);

    const articles: Array<{ articleId: number; subject: string; nickname: string }> =
      listResult.message?.result?.articleList?.map((a: any) => ({
        articleId: a.articleId,
        subject: a.subject,
        nickname: a.nickname,
      })) ?? [];

    console.log(`최근 글 ${articles.length}개 조회\n`);

    const blocked: typeof articles = [];

    for (const article of articles) {
      const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${CAFE_ID}/articles/${article.articleId}?useCafeId=true`;

      const result = await page.evaluate(async (url: string) => {
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) return { error: `HTTP ${res.status}` };
          return await res.json();
        } catch (e) {
          return { error: String(e) };
        }
      }, apiUrl);

      if (result.error) continue;

      const isWriteComment = result?.result?.article?.isWriteComment;
      if (isWriteComment === false) {
        blocked.push(article);
      }
    }

    await saveCookiesForAccount(checker.accountId);

    console.log(`\n=== 댓글 차단 ${blocked.length}건 ===\n`);

    if (blocked.length === 0) {
      console.log('댓글 차단 글 없음');
    } else {
      for (const b of blocked) {
        console.log(`- ${b.subject} (${b.nickname})`);
        console.log(`  https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${b.articleId}`);
      }
    }
  } finally {
    releaseAccountLock(checker.accountId);
  }
};

main()
  .then(async () => {
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('failed:', e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
