import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import mongoose from 'mongoose';
import type { Page } from 'playwright';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  isLoginRedirect,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';
import { Account } from '@/shared/models/account';
import { PublishedArticle } from '@/shared/models/published-article';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const TARGET_DATE = process.env.TARGET_DATE || '2026-06-12';
const KEEP_COUNT = Number.parseInt(process.env.KEEP_COUNT || '12', 10);
const PAGE_LIMIT = Number.parseInt(process.env.PAGE_LIMIT || '8', 10);
const MIN_PAGES = Number.parseInt(process.env.MIN_PAGES || '2', 10);
const DRY_RUN = process.env.DRY_RUN === 'true';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const CAFES = [
  { name: '건강관리소', cafeId: '25227349', cafeUrl: 'minemh' },
  { name: '건강한노후준비', cafeId: '25636798', cafeUrl: 'freemapleafreecabj' },
] as const;

type CafeTarget = (typeof CAFES)[number];

interface LiveArticle {
  cafeName: string;
  cafeId: string;
  articleId: number;
  title: string;
  nickname: string;
  menuName: string;
  commentCount: number;
  timestamp: number;
  dateKey: string;
  time: string;
}

interface OwnLiveArticle extends LiveArticle {
  keyword: string;
  postType?: string;
  writerAccountId: string;
  dbTitle: string;
}

interface DeleteTarget extends OwnLiveArticle {
  keepRank: number;
}

interface DeleteResult {
  target: DeleteTarget;
  success: boolean;
  error?: string;
}

const toKstDateKey = (timestamp: number): string =>
  new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);

const toKstMinute = (timestamp: number): string =>
  new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');

const parseTimestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsedNumber = Number.parseInt(value, 10);
    if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
      return parsedNumber;
    }

    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
  }

  return 0;
};

const ensureLoggedIn = async (
  accountId: string,
  password: string,
  reason: string
): Promise<void> => {
  const loggedIn = await isAccountLoggedIn(accountId);
  if (loggedIn) return;

  const loginResult = await loginAccount(accountId, password, {
    waitForLoginMs: 3 * 60 * 1000,
    reason,
  });
  if (!loginResult.success) {
    throw new Error(loginResult.error || '로그인 실패');
  }
};

const scanCafeArticlesForDate = async (
  page: Page,
  cafe: CafeTarget,
  dateKey: string
): Promise<{ articles: LiveArticle[]; pagesScanned: number }> => {
  await page.goto(`https://cafe.naver.com/${cafe.cafeUrl}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);

  const articles: LiveArticle[] = [];
  let pagesScanned = 0;

  for (let pageNumber = 1; pageNumber <= PAGE_LIMIT; pageNumber += 1) {
    const apiUrl =
      `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json` +
      `?search.clubid=${cafe.cafeId}` +
      `&search.page=${pageNumber}` +
      `&search.perPage=50` +
      `&search.queryType=lastArticle` +
      `&search.boardtype=L`;

    const apiResult = await page.evaluate(async (url: string) => {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const text = await response.text();
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch {}

        if (!response.ok) {
          return { error: `HTTP ${response.status}`, text: text.slice(0, 300) };
        }

        return json || { error: 'JSON parse failed', text: text.slice(0, 300) };
      } catch (error) {
        return { error: String(error) };
      }
    }, apiUrl);

    if ('error' in apiResult && apiResult.error) {
      throw new Error(`${cafe.name} page ${pageNumber}: ${apiResult.error}`);
    }

    const response = apiResult as {
      message?: {
        status?: string;
        error?: { msg?: string };
        result?: {
          articleList?: Array<{
            articleId?: number;
            subject?: string;
            nickname?: string;
            menuName?: string;
            commentCount?: number;
            writeDateTimestamp?: number | string;
            writeDate?: number | string;
          }>;
        };
      };
    };
    const status = response.message?.status;
    if (status && status !== '200') {
      throw new Error(
        `${cafe.name} page ${pageNumber}: ${response.message?.error?.msg || status}`
      );
    }

    const list = response.message?.result?.articleList || [];
    pagesScanned = pageNumber;
    console.log(`[SCAN] ${cafe.name} page=${pageNumber} count=${list.length}`);

    if (list.length === 0) {
      break;
    }

    const pageDateKeys: string[] = [];
    for (const raw of list) {
      const timestamp = parseTimestamp(raw.writeDateTimestamp ?? raw.writeDate);
      if (!timestamp) continue;

      const currentDateKey = toKstDateKey(timestamp);
      pageDateKeys.push(currentDateKey);
      if (currentDateKey !== dateKey || !raw.articleId) {
        continue;
      }

      articles.push({
        cafeName: cafe.name,
        cafeId: cafe.cafeId,
        articleId: raw.articleId,
        title: raw.subject || '',
        nickname: raw.nickname || '',
        menuName: raw.menuName || '',
        commentCount: raw.commentCount || 0,
        timestamp,
        dateKey: currentDateKey,
        time: toKstMinute(timestamp),
      });
    }

    const oldestDateKey = pageDateKeys.reduce((oldest, current) => {
      return !oldest || current < oldest ? current : oldest;
    }, '');

    if (pageNumber >= MIN_PAGES && oldestDateKey && oldestDateKey < dateKey) {
      break;
    }
  }

  return { articles, pagesScanned };
};

const collectDirectOwnArticles = async (
  viewerAccount: { accountId: string; password: string },
  dateKey: string
): Promise<{ ownArticles: OwnLiveArticle[]; liveArticles: LiveArticle[]; pages: Record<string, number> }> => {
  await acquireAccountLock(viewerAccount.accountId);

  try {
    await ensureLoggedIn(
      viewerAccount.accountId,
      viewerAccount.password,
      'delete_health_overcap_scan'
    );

    const page = await getPageForAccount(viewerAccount.accountId);
    const liveArticles: LiveArticle[] = [];
    const pages: Record<string, number> = {};

    for (const cafe of CAFES) {
      const result = await scanCafeArticlesForDate(page, cafe, dateKey);
      liveArticles.push(...result.articles);
      pages[cafe.name] = result.pagesScanned;
    }

    await saveCookiesForAccount(viewerAccount.accountId);

    const liveArticleIds = liveArticles.map(({ articleId }) => articleId);
    const publishedArticles = await PublishedArticle.find({
      cafeId: { $in: CAFES.map(({ cafeId }) => cafeId) },
      articleId: { $in: liveArticleIds },
    }).lean();
    const publishedByKey = new Map(
      publishedArticles.map((article) => [
        `${article.cafeId}:${article.articleId}`,
        article,
      ])
    );

    const ownArticles = liveArticles
      .map((article) => {
        const publishedArticle = publishedByKey.get(
          `${article.cafeId}:${article.articleId}`
        );
        if (!publishedArticle) return null;

        return {
          ...article,
          keyword: publishedArticle.keyword,
          postType: publishedArticle.postType,
          writerAccountId: publishedArticle.writerAccountId,
          dbTitle: publishedArticle.title,
        };
      })
      .filter((article): article is OwnLiveArticle => article !== null)
      .sort((a, b) => a.timestamp - b.timestamp);

    return { ownArticles, liveArticles, pages };
  } finally {
    releaseAccountLock(viewerAccount.accountId);
  }
};

const hasDeletedMessage = async (page: Page): Promise<boolean> => {
  return page
    .evaluate(() => {
      const text = document.body.innerText || '';
      return /삭제된\s*게시글|존재하지\s*않는\s*게시글|게시글이\s*없습니다|없는\s*게시글/.test(
        text
      );
    })
    .catch(() => false);
};

const clickDeleteControl = async (page: Page): Promise<boolean> => {
  const clickedDirect = await page
    .evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
      const deleteButton = candidates.find((element) => {
        const label = (element.textContent || '').trim();
        const className = element.getAttribute('class') || '';
        return (label === '삭제' || label === '삭제하기') && !/gnb_del_txt/.test(className);
      });
      deleteButton?.click();
      return Boolean(deleteButton);
    })
    .catch(() => false);

  if (clickedDirect) return true;

  const moreSelectors = [
    'button[aria-label*="더보기"]',
    'a[aria-label*="더보기"]',
    '.ArticleTool button',
    '.article_tool button',
    '.btn_more',
    '.button_more',
    'button:has-text("더보기")',
    'a:has-text("더보기")',
  ];

  for (const selector of moreSelectors) {
    const moreButton = page.locator(selector).first();
    const visible = await moreButton.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) continue;

    await moreButton.click().catch(() => undefined);
    await page.waitForTimeout(800);

    const clickedDelete = await page
      .evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const deleteButton = candidates.find((element) => {
          const label = (element.textContent || '').trim();
          const className = element.getAttribute('class') || '';
          return (label === '삭제' || label === '삭제하기') && !/gnb_del_txt/.test(className);
        });
        deleteButton?.click();
        return Boolean(deleteButton);
      })
      .catch(() => false);

    if (clickedDelete) return true;
    await page.keyboard.press('Escape').catch(() => undefined);
  }

  return false;
};

const confirmDeleteIfNeeded = async (page: Page): Promise<void> => {
  await page.waitForTimeout(800);
  await page
    .evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
      const confirmButton = candidates.find((element) => {
        const label = (element.textContent || '').trim();
        return label === '확인' || label === '예' || label === '삭제';
      });
      confirmButton?.click();
    })
    .catch(() => undefined);
};

const verifyArticleDeleted = async (
  page: Page,
  cafeId: string,
  articleId: number
): Promise<boolean> => {
  await page
    .goto(`https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(2500);

  return hasDeletedMessage(page);
};

const tryDeleteArticleByUi = async (
  page: Page,
  cafeId: string,
  articleId: number
): Promise<boolean> => {
  const urls = [
    `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`,
    `https://m.cafe.naver.com/ArticleRead.nhn?clubid=${cafeId}&articleid=${articleId}&boardtype=L`,
  ];

  page.on('dialog', async (dialog) => {
    await dialog.accept().catch(() => undefined);
  });

  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(3500);

    if (isLoginRedirect(page.url())) {
      continue;
    }

    if (await hasDeletedMessage(page)) {
      return true;
    }

    const clickedDelete = await clickDeleteControl(page);
    if (!clickedDelete) {
      continue;
    }

    await confirmDeleteIfNeeded(page);
    await page.waitForTimeout(2500);

    if (await verifyArticleDeleted(page, cafeId, articleId)) {
      return true;
    }
  }

  return false;
};

const deleteArticleWithWriter = async (
  target: DeleteTarget,
  accountMap: Map<string, { accountId: string; password: string }>
): Promise<DeleteResult> => {
  const writer = accountMap.get(target.writerAccountId);
  if (!writer) {
    return { target, success: false, error: `writer 없음: ${target.writerAccountId}` };
  }

  await acquireAccountLock(writer.accountId);
  try {
    await ensureLoggedIn(writer.accountId, writer.password, `delete_article_${target.articleId}`);
    const page = await getPageForAccount(writer.accountId);

    const success = await tryDeleteArticleByUi(page, target.cafeId, target.articleId);
    if (!success) {
      return { target, success: false, error: 'UI 삭제 실패' };
    }

    await PublishedArticle.deleteOne({
      cafeId: target.cafeId,
      articleId: target.articleId,
    });
    await saveCookiesForAccount(writer.accountId);

    return { target, success: true };
  } catch (error) {
    return {
      target,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    releaseAccountLock(writer.accountId);
  }
};

const pickDeleteTargets = (articles: OwnLiveArticle[]): DeleteTarget[] => {
  const targets: DeleteTarget[] = [];

  for (const cafe of CAFES) {
    const cafeArticles = articles
      .filter(({ cafeId }) => cafeId === cafe.cafeId)
      .sort((a, b) => a.timestamp - b.timestamp);

    const excessArticles = cafeArticles.slice(KEEP_COUNT);
    targets.push(
      ...excessArticles.map((article, index) => ({
        ...article,
        keepRank: KEEP_COUNT + index + 1,
      }))
    );
  }

  return targets;
};

const main = async (): Promise<void> => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const accountMap = new Map(
    accounts.map((account) => [
      account.accountId,
      { accountId: account.accountId, password: account.password },
    ])
  );

  const latestHealthArticle = await PublishedArticle.findOne({
    cafeId: { $in: CAFES.map(({ cafeId }) => cafeId) },
  })
    .sort({ publishedAt: -1 })
    .lean();
  const viewer =
    (latestHealthArticle && accountMap.get(latestHealthArticle.writerAccountId)) ||
    accountMap.get('tinyfish183') ||
    accountMap.values().next().value;
  if (!viewer) {
    throw new Error('viewer account not found');
  }

  console.log(`=== 직접 카페 초과 글 정리 시작 date=${TARGET_DATE} keep=${KEEP_COUNT} dryRun=${DRY_RUN} ===`);
  console.log(`viewer=${viewer.accountId}`);

  const before = await collectDirectOwnArticles(viewer, TARGET_DATE);
  const deleteTargets = pickDeleteTargets(before.ownArticles);

  console.log('=== 직접 조회 현황 ===');
  for (const cafe of CAFES) {
    const count = before.ownArticles.filter(({ cafeId }) => cafeId === cafe.cafeId).length;
    console.log(`- ${cafe.name}: ${count}건 / pages=${before.pages[cafe.name] || 0}`);
  }

  console.log('=== 삭제 대상 ===');
  if (deleteTargets.length === 0) {
    console.log('삭제 대상 없음');
  } else {
    for (const target of deleteTargets) {
      console.log(
        `- ${target.cafeName} #${target.articleId} rank=${target.keepRank} ${target.time} ${target.keyword} / ${target.title}`
      );
    }
  }

  const results: DeleteResult[] = [];
  if (!DRY_RUN) {
    for (const target of deleteTargets) {
      console.log(`[DELETE] ${target.cafeName} #${target.articleId} ${target.keyword}`);
      const result = await deleteArticleWithWriter(target, accountMap);
      results.push(result);
      console.log(
        result.success
          ? `[DELETE] 완료 #${target.articleId}`
          : `[DELETE] 실패 #${target.articleId}: ${result.error || 'unknown'}`
      );
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  const after = await collectDirectOwnArticles(viewer, TARGET_DATE);
  console.log('=== 삭제 후 직접 조회 현황 ===');
  for (const cafe of CAFES) {
    const cafeRows = after.ownArticles.filter(({ cafeId }) => cafeId === cafe.cafeId);
    console.log(`- ${cafe.name}: ${cafeRows.length}건`);
    for (const row of cafeRows) {
      console.log(`  ${row.time} #${row.articleId} ${row.keyword}`);
    }
  }

  mkdirSync('scripts/artifacts', { recursive: true });
  const artifactPath = `scripts/artifacts/health-overcap-delete-${TARGET_DATE}.json`;
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        targetDate: TARGET_DATE,
        keepCount: KEEP_COUNT,
        dryRun: DRY_RUN,
        before: before.ownArticles,
        deleteTargets,
        results,
        after: after.ownArticles,
      },
      null,
      2
    )}\n`
  );
  console.log(`artifact=${artifactPath}`);
};

main()
  .then(async () => {
    await closeAllContexts().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    await closeAllContexts().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  });
