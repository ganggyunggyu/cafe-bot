/**
 * 벤타쿠 댓글 차단 글 → 댓글 허용으로 전환 스크립트
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/enable-comments.ts [cafeId]
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { PublishedArticle } from '../src/shared/models/published-article';
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
const CAFE_ID = process.argv[2] || '31642514'; // 벤타쿠
const LOGIN_ID = 'qwzx16';

const enableCommentsOnArticle = async (
  accountId: string,
  password: string,
  cafeId: string,
  articleId: number
): Promise<boolean> => {
  await acquireAccountLock(accountId);
  try {
    const loggedIn = await isAccountLoggedIn(accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(accountId, password);
      if (!loginResult.success) {
        console.log(`  ❌ 로그인 실패: ${loginResult.error}`);
        return false;
      }
    }

    const page = await getPageForAccount(accountId);

    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}/modify`;
    await page.goto(modifyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
      await page.waitForSelector('.setting_area, #coment', { timeout: 15000 });
    } catch {
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

    const commentCheckbox = await page.$('#coment');
    if (!commentCheckbox) {
      console.log(`  ⚠️ #${articleId} 댓글 체크박스 없음`);
      return false;
    }

    const isChecked = await commentCheckbox.evaluate((el) => (el as HTMLInputElement).checked);
    if (isChecked) {
      console.log(`  ✅ #${articleId} 이미 댓글 허용됨`);
      return true;
    }

    const label = await page.$('label[for="coment"]');
    if (label) {
      await label.click();
    } else {
      await commentCheckbox.click();
    }
    console.log(`  🔓 #${articleId} 댓글 허용으로 변경`);
    await page.waitForTimeout(500);

    const submitButton = await page.$('a.BaseButton--skinGreen, a.BaseButton');
    if (!submitButton) {
      console.log(`  ❌ #${articleId} 수정 버튼 없음`);
      return false;
    }

    await submitButton.click();

    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
    } catch {
      await page.waitForTimeout(3000);
    }

    console.log(`  ✅ #${articleId} 댓글 열기 완료`);
    await saveCookiesForAccount(accountId);
    return true;
  } catch (error) {
    console.log(`  ❌ #${articleId} 오류: ${error instanceof Error ? error.message : error}`);
    return false;
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
  const writerIds = writerAccounts.map((a) => a.accountId);
  const commenterAccounts = accounts.filter((a) => a.role === 'commenter');

  console.log(`Writer 계정: ${writerIds.join(', ')}`);

  const articles = await PublishedArticle.find({
    cafeId: CAFE_ID,
    writerAccountId: { $in: writerIds },
    status: 'published',
  })
    .sort({ publishedAt: -1 })
    .lean();

  if (articles.length === 0) {
    console.log('벤타쿠: published 글 0건');
    return;
  }

  console.log(`벤타쿠: published 글 ${articles.length}건 체크 중...\n`);

  const checker = commenterAccounts[0];
  if (!checker) throw new Error('commenter 계정 없음');

  await acquireAccountLock(checker.accountId);
  const commentDisabled: Array<{
    articleId: number;
    keyword: string;
    writerAccountId: string;
    articleUrl: string;
  }> = [];

  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(checker.accountId, checker.password);
      if (!loginResult.success) throw new Error(`체크 계정 로그인 실패: ${loginResult.error}`);
    }

    const page = await getPageForAccount(checker.accountId);
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

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

      if (result.error) {
        console.log(`  ❌ #${article.articleId} API 오류: ${result.error}`);
        continue;
      }

      const isWriteComment = result?.result?.article?.isWriteComment;
      if (isWriteComment === false) {
        commentDisabled.push({
          articleId: article.articleId,
          keyword: article.keyword,
          writerAccountId: article.writerAccountId,
          articleUrl: article.articleUrl,
        });
      }
    }

    await saveCookiesForAccount(checker.accountId);
  } finally {
    releaseAccountLock(checker.accountId);
  }

  console.log(`\n=== 댓글 차단 ${commentDisabled.length}건 발견 ===\n`);

  if (commentDisabled.length === 0) {
    console.log('댓글 차단 글 없음, 종료');
    return;
  }

  for (const item of commentDisabled) {
    console.log(`- #${item.articleId} ${item.keyword} (${item.writerAccountId})`);
  }

  const writerMap = new Map<string, typeof commentDisabled>();
  for (const item of commentDisabled) {
    const list = writerMap.get(item.writerAccountId) || [];
    list.push(item);
    writerMap.set(item.writerAccountId, list);
  }

  let successCount = 0;
  let failCount = 0;

  for (const [writerId, items] of writerMap) {
    const writerAccount = writerAccounts.find((a) => a.accountId === writerId);
    if (!writerAccount) {
      console.log(`\n⚠️ Writer ${writerId} 계정 정보 없음, ${items.length}건 스킵`);
      failCount += items.length;
      continue;
    }

    console.log(`\n--- ${writerId} (${items.length}건) ---`);

    for (const item of items) {
      const success = await enableCommentsOnArticle(
        writerId,
        writerAccount.password,
        CAFE_ID,
        item.articleId
      );
      if (success) successCount++;
      else failCount++;

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n=== 완료: 성공 ${successCount}건 / 실패 ${failCount}건 ===`);
};

main()
  .then(async () => {
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('enable-comments failed:', e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
