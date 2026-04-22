import dotenv from 'dotenv';
import mongoose from 'mongoose';
import type { Page } from 'playwright';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
} from '../src/shared/lib/multi-session';
import { Account } from '../src/shared/models/account';
import { PublishedArticle } from '../src/shared/models/published-article';

dotenv.config({ path: '.env.local' });

type CliArgs = {
  cafeId: string;
  dateKey: string;
  dryRun: boolean;
};

type ArticleTarget = {
  articleId: number;
  articleUrl: string;
  cafeId: string;
  title: string;
  writerAccountId: string;
  publishedAt: Date;
  recordedCommentCount: number;
  recordedReplyCount: number;
  recordedCommentRecords: number;
  commenterAccountIds: string[];
};

type DeletionResult = {
  articleId: number;
  deletedCount: number;
};

type VerificationResult = {
  articleId: number;
  remainingVisibleComments: number;
};

const isRecoverablePageError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /Target page, context or browser has been closed|Target crashed|Execution context was destroyed/i.test(
    message
  );
};

const CAFE_TOKEN_MAP: Record<string, string> = {
  '25729954': '25729954',
  쇼핑지름신: '25729954',
  shopjirmsin: '25729954',
  '25460974': '25460974',
  샤넬오픈런: '25460974',
  shoppingtpw: '25460974',
  '25636798': '25636798',
  건강한노후준비: '25636798',
  '25227349': '25227349',
  건강관리소: '25227349',
};

const DEFAULT_ARGS: CliArgs = {
  cafeId: '25729954',
  dateKey: '2026-04-21',
  dryRun: false,
};

const parseArgs = (): CliArgs => {
  const args = process.argv.slice(2);
  const parsed: CliArgs = { ...DEFAULT_ARGS };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const nextToken = args[index + 1];

    if (token === '--cafe' && nextToken) {
      parsed.cafeId = CAFE_TOKEN_MAP[nextToken] || nextToken;
      index += 1;
      continue;
    }

    if (token === '--date' && nextToken) {
      parsed.dateKey = nextToken;
      index += 1;
      continue;
    }

    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (token === '--help') {
      console.log('Usage: npx tsx --env-file=.env.local scripts/delete-comments-by-date.ts --cafe 25729954 --date 2026-04-21 [--dry-run]');
      process.exit(0);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.dateKey)) {
    throw new Error(`날짜 형식이 올바르지 않음: ${parsed.dateKey}`);
  }

  return parsed;
};

const getKstDayRange = (dateKey: string): { start: Date; end: Date } => {
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  const end = new Date(`${dateKey}T00:00:00+09:00`);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const getArticleTargets = async ({ cafeId, dateKey }: CliArgs): Promise<ArticleTarget[]> => {
  const { start, end } = getKstDayRange(dateKey);
  const documents = await PublishedArticle.find({
    cafeId,
    publishedAt: { $gte: start, $lt: end },
  })
    .sort({ publishedAt: 1, articleId: 1 })
    .lean();

  return documents.map((document) => {
    const commenterAccountIds = Array.from(
      new Set((document.comments || []).map(({ accountId }) => accountId).filter(Boolean))
    ).sort();

    return {
      articleId: document.articleId,
      articleUrl: document.articleUrl,
      cafeId: document.cafeId,
      title: document.title,
      writerAccountId: document.writerAccountId,
      publishedAt: document.publishedAt,
      recordedCommentCount: document.commentCount || 0,
      recordedReplyCount: document.replyCount || 0,
      recordedCommentRecords: (document.comments || []).length,
      commenterAccountIds,
    };
  });
};

const buildAccountTargetMap = (targets: ArticleTarget[]): Map<string, ArticleTarget[]> => {
  const byAccount = new Map<string, ArticleTarget[]>();

  for (const target of targets) {
    for (const accountId of target.commenterAccountIds) {
      const currentTargets = byAccount.get(accountId) || [];
      currentTargets.push(target);
      byAccount.set(accountId, currentTargets);
    }
  }

  return byAccount;
};

const openArticle = async (page: Page, cafeId: string, articleId: number): Promise<void> => {
  await page.goto(`https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(4000);
};

const getVisibleCommentStats = async (page: Page): Promise<{ mine: number; total: number }> => {
  return page.evaluate(() => {
    const total = document.querySelectorAll('.CommentItem, .comment_item').length;
    const mine = document.querySelectorAll('.CommentItem--mine').length;

    return { mine, total };
  });
};

const clickDeleteForFirstMine = async (page: Page): Promise<boolean> => {
  const mineItems = await page.$$('.CommentItem--mine');

  for (const mineItem of mineItems) {
    try {
      await mineItem.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      const toolButton = await mineItem.$('button.comment_tool_button');
      if (!toolButton) {
        continue;
      }

      await toolButton.click();
      await page.waitForTimeout(600);

      const menuItems = await page.$$('.layer_menu button, .layer_menu a, [role="menu"] button, [role="menuitem"], button, a');
      for (const menuItem of menuItems) {
        const text = ((await menuItem.textContent()) || '').trim();
        if (text !== '삭제') {
          continue;
        }

        try {
          await menuItem.click();
          await page.waitForTimeout(400);

          const confirmButton = await page.$('button:has-text("확인")');
          if (confirmButton) {
            await confirmButton.click().catch(() => undefined);
          }

          await page.waitForTimeout(1200);
          return true;
        } catch {
          continue;
        }
      }

      await page.keyboard.press('Escape').catch(() => undefined);
    } catch {
      continue;
    }
  }

  return false;
};

const deleteAllMineOnArticle = async (
  page: Page,
  target: ArticleTarget
): Promise<DeletionResult> => {
  await openArticle(page, target.cafeId, target.articleId);

  let deletedCount = 0;
  let safety = 0;

  while (safety < 80) {
    safety += 1;

    const { mine } = await getVisibleCommentStats(page);
    if (mine === 0) {
      break;
    }

    const deleted = await clickDeleteForFirstMine(page);
    if (!deleted) {
      break;
    }

    deletedCount += 1;
  }

  return {
    articleId: target.articleId,
    deletedCount,
  };
};

const deleteAllMineOnArticleWithRetry = async (
  accountId: string,
  password: string,
  target: ArticleTarget
): Promise<DeletionResult> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const page = await ensureLoggedInPage(accountId, password);
      return await deleteAllMineOnArticle(page, target);
    } catch (error) {
      lastError = error;
      if (!isRecoverablePageError(error) || attempt === 2) {
        break;
      }

      console.log(`  #${target.articleId} 페이지 종료 감지, 재시도 ${attempt}/2`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw lastError;
};

const ensureLoggedInPage = async (accountId: string, password: string): Promise<Page> => {
  const loggedIn = await isAccountLoggedIn(accountId);
  if (!loggedIn) {
    const loginResult = await loginAccount(accountId, password);
    if (!loginResult.success) {
      throw new Error(loginResult.error || '로그인 실패');
    }
  }

  const page = await getPageForAccount(accountId);
  page.removeAllListeners('dialog');
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept();
    } catch {}
  });

  return page;
};

const verifyOneTarget = async (
  accountId: string,
  password: string,
  targets: ArticleTarget[]
): Promise<VerificationResult[]> => {
  const results: VerificationResult[] = [];

  for (const target of targets) {
    let remainingVisibleComments = -1;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const page = await ensureLoggedInPage(accountId, password);
        await openArticle(page, target.cafeId, target.articleId);
        const { total } = await getVisibleCommentStats(page);
        remainingVisibleComments = total;
        break;
      } catch (error) {
        if (!isRecoverablePageError(error) || attempt === 2) {
          throw error;
        }

        console.log(`  #${target.articleId} 검증 페이지 종료 감지, 재시도 ${attempt}/2`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    results.push({
      articleId: target.articleId,
      remainingVisibleComments,
    });
  }

  return results;
};

const clearVerifiedArticleComments = async (
  targets: ArticleTarget[],
  verificationResults: VerificationResult[]
): Promise<void> => {
  const verifiedEmptyArticleIds = new Set(
    verificationResults
      .filter(({ remainingVisibleComments }) => remainingVisibleComments === 0)
      .map(({ articleId }) => articleId)
  );

  for (const { articleId, cafeId } of targets) {
    if (!verifiedEmptyArticleIds.has(articleId)) {
      continue;
    }

    await PublishedArticle.updateOne(
      { cafeId, articleId },
      { $set: { comments: [], commentCount: 0, replyCount: 0 } }
    );
  }
};

const printTargets = (targets: ArticleTarget[]): void => {
  console.log(`대상 글 ${targets.length}건`);

  for (const {
    articleId,
    writerAccountId,
    publishedAt,
    recordedCommentCount,
    recordedReplyCount,
    recordedCommentRecords,
    commenterAccountIds,
    title,
  } of targets) {
    console.log(
      `- #${articleId} | writer=${writerAccountId} | ${new Date(publishedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | c=${recordedCommentCount}, r=${recordedReplyCount}, records=${recordedCommentRecords} | commenters=${commenterAccountIds.join(', ')} | ${title}`
    );
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs();

  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
  });

  const targets = await getArticleTargets(args);
  printTargets(targets);

  if (targets.length === 0) {
    console.log('삭제 대상 글 없음');
    await mongoose.disconnect();
    process.exit(0);
  }

  const accountTargets = buildAccountTargetMap(targets);
  console.log(`\n대상 계정 ${accountTargets.size}개`);

  if (args.dryRun) {
    await mongoose.disconnect();
    process.exit(0);
  }

  const deletionResults = new Map<string, DeletionResult[]>();

  for (const [accountId, ownedTargets] of accountTargets) {
    const account = await Account.findOne({ accountId }).lean();
    if (!account) {
      console.log(`\n[SKIP] 계정 정보 없음: ${accountId}`);
      continue;
    }

    console.log(`\n====== ${accountId} | 대상 글 ${ownedTargets.length}건 ======`);

    await acquireAccountLock(accountId);
    try {
      const accountResults: DeletionResult[] = [];

      for (const target of ownedTargets) {
        try {
          const result = await deleteAllMineOnArticleWithRetry(
            accountId,
            account.password,
            target
          );
          accountResults.push(result);
          console.log(`  #${target.articleId} 삭제 ${result.deletedCount}개`);
        } catch (error) {
          console.log(
            `  #${target.articleId} 삭제 실패: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      deletionResults.set(accountId, accountResults);
    } finally {
      releaseAccountLock(accountId);
    }
  }

  const verificationAccountId = accountTargets.keys().next().value;
  if (!verificationAccountId) {
    console.log('\n검증용 계정을 찾지 못함');
    await closeAllContexts();
    await mongoose.disconnect();
    return;
  }

  const verificationAccount = await Account.findOne({ accountId: verificationAccountId }).lean();
  if (!verificationAccount) {
    throw new Error(`검증용 계정 정보 없음: ${verificationAccountId}`);
  }

  let verificationResults: VerificationResult[] = [];

  await acquireAccountLock(verificationAccountId);
  try {
    verificationResults = await verifyOneTarget(
      verificationAccountId,
      verificationAccount.password,
      targets
    );
  } finally {
    releaseAccountLock(verificationAccountId);
  }

  await clearVerifiedArticleComments(targets, verificationResults);

  console.log('\n=== 삭제 요약 ===');
  for (const [accountId, results] of deletionResults) {
    const deletedCount = results.reduce((sum, { deletedCount: count }) => sum + count, 0);
    console.log(`- ${accountId}: ${deletedCount}개 삭제`);
  }

  console.log('\n=== 검증 결과 ===');
  for (const result of verificationResults) {
    console.log(`- #${result.articleId}: 남은 댓글 ${result.remainingVisibleComments}개`);
  }

  await closeAllContexts();
  await mongoose.disconnect();
  process.exit(0);
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);

  try {
    await closeAllContexts();
  } catch {}

  try {
    await mongoose.disconnect();
  } catch {}

  process.exit(1);
});
