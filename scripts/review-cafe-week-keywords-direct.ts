import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import mongoose from 'mongoose';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';
import { Account } from '@/shared/models/account';
import { PublishedArticle } from '@/shared/models/published-article';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const START_DATE = process.env.START_DATE || '2026-05-18';
const END_DATE = process.env.END_DATE || '2026-05-24';
const CHECKER_ACCOUNT_ID = process.env.CHECKER_ACCOUNT_ID || process.env.VIEWER_ACCOUNT_ID;
const ARTIFACT_DIR = 'scripts/artifacts';
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const CAFES = [
  { name: '건강관리소', cafeId: '25227349', cafeUrl: 'minemh' },
  { name: '건강한노후준비', cafeId: '25636798', cafeUrl: 'freemapleafreecabj' },
  { name: '쇼핑지름신', cafeId: '25729954', cafeUrl: 'shopjirmsin' },
  { name: '샤넬오픈런', cafeId: '25460974', cafeUrl: 'shoppingtpw' },
] as const;

interface ViewerAccount {
  accountId: string;
  password: string;
}

interface LiveDetail {
  articleId: number;
  ok: boolean;
  status: number;
  subject?: string;
  menuName?: string;
  nickname?: string;
  commentCount?: number;
  writeTimestamp?: number;
  error?: string;
  bodyPreview?: string;
}

interface ReviewRow {
  cafeName: string;
  cafeId: string;
  articleId: number;
  keyword: string;
  postType: string;
  writerAccountId: string;
  dbTitle: string;
  dbDate: string;
  dbTime: string;
  articleUrl: string;
  liveOk: boolean;
  liveTitle: string;
  liveMenuName: string;
  liveNickname: string;
  liveCommentCount: number | null;
  liveDate: string;
  liveTime: string;
  issue: string;
}

const toKstDateKey = (date: Date | string | number): string =>
  new Date(new Date(date).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

const toKstMinute = (date: Date | string | number): string =>
  new Date(new Date(date).getTime() + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');

const parseKstDateStart = (dateKey: string): Date => new Date(`${dateKey}T00:00:00+09:00`);

const getEndExclusive = (dateKey: string): Date =>
  new Date(parseKstDateStart(dateKey).getTime() + DAY_MS);

const csvEscape = (value: unknown): string => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const normalizeTitle = (value: string): string => value.replace(/\s+/g, ' ').trim();

const chooseViewerAccount = async (): Promise<ViewerAccount> => {
  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  if (accounts.length === 0) {
    throw new Error(`active accounts not found: ${LOGIN_ID}`);
  }

  const requested = CHECKER_ACCOUNT_ID
    ? accounts.find(({ accountId }) => accountId === CHECKER_ACCOUNT_ID)
    : null;
  const account = requested || accounts.find(({ role }) => role === 'commenter') || accounts[0];

  return { accountId: account.accountId, password: account.password };
};

const ensureLoggedIn = async (account: ViewerAccount): Promise<void> => {
  const loggedIn = await isAccountLoggedIn(account.accountId);
  if (loggedIn) return;

  const result = await loginAccount(account.accountId, account.password, {
    waitForLoginMs: 3 * 60 * 1000,
    reason: 'review_cafe_week_keywords_direct',
  });

  if (!result.success) {
    throw new Error(result.error || 'login failed');
  }
};

const fetchLiveDetails = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  cafeId: string,
  articleIds: number[]
): Promise<LiveDetail[]> => {
  if (articleIds.length === 0) return [];

  const browserScript = String.raw`async ({ targetCafeId, targetArticleIds }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const results = [];

      for (const articleId of targetArticleIds) {
        const url =
          'https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/' +
          targetCafeId +
          '/articles/' +
          articleId +
          '?useCafeId=true';

        try {
          const response = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          const text = await response.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}

          const article = json?.result?.article;
          const menuName =
            article?.menu?.name ||
            article?.menuName ||
            article?.board?.name ||
            '';
          const writer = article?.writer || {};
          const writeTimestampRaw =
            article?.writeDateTimestamp ||
            article?.writeDate ||
            article?.addDateTimestamp ||
            article?.addDate ||
            article?.createdAt;
          const writeTimestamp =
            typeof writeTimestampRaw === 'number'
              ? writeTimestampRaw
              : Number.parseInt(String(writeTimestampRaw || ''), 10);

          results.push({
            articleId,
            ok: response.ok && Boolean(article),
            status: response.status,
            subject: article?.subject || '',
            menuName,
            nickname: writer?.nickname || article?.nickname || '',
            commentCount: article?.commentCount ?? null,
            writeTimestamp: Number.isFinite(writeTimestamp) ? writeTimestamp : undefined,
            error: json?.result?.reason || json?.result?.message || json?.message || '',
            bodyPreview: text.slice(0, 240),
          });
        } catch (error) {
          results.push({
            articleId,
            ok: false,
            status: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        await sleep(120);
      }

      return results;
    }`;

  const payload = JSON.stringify({ targetCafeId: cafeId, targetArticleIds: articleIds });
  return page.evaluate(`(${browserScript})(${payload})`);
};

const getIssue = (row: {
  liveOk: boolean;
  dbTitle: string;
  liveTitle: string;
  dbDate: string;
  liveDate: string;
}): string => {
  if (!row.liveOk) return 'live_missing_or_inaccessible';
  if (row.liveDate && row.liveDate !== row.dbDate) return 'date_mismatch';
  if (row.liveTitle && normalizeTitle(row.liveTitle) !== normalizeTitle(row.dbTitle)) {
    return 'title_mismatch';
  }
  return '';
};

const main = async (): Promise<void> => {
  if (process.env.PLAYWRIGHT_HEADLESS !== 'true') {
    console.log(`[CONFIG] PLAYWRIGHT_HEADLESS=${process.env.PLAYWRIGHT_HEADLESS || '(unset)'} -> true 권장`);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI missing');

  const start = parseKstDateStart(START_DATE);
  const endExclusive = getEndExclusive(END_DATE);

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });

  const viewer = await chooseViewerAccount();
  console.log(`[VIEWER] ${viewer.accountId}`);
  console.log(`[RANGE] ${START_DATE} ~ ${END_DATE} KST`);

  const articles = await PublishedArticle.find({
    cafeId: { $in: CAFES.map(({ cafeId }) => cafeId) },
    publishedAt: { $gte: start, $lt: endExclusive },
  })
    .sort({ cafeId: 1, publishedAt: 1, articleId: 1 })
    .lean();

  console.log(`[DB] published articles=${articles.length}`);

  await acquireAccountLock(viewer.accountId);

  const rows: ReviewRow[] = [];

  try {
    await ensureLoggedIn(viewer);
    const page = await getPageForAccount(viewer.accountId);

    for (const cafe of CAFES) {
      const cafeArticles = articles.filter(({ cafeId }) => cafeId === cafe.cafeId);
      console.log(`[CAFE] ${cafe.name} DB=${cafeArticles.length}`);

      await page.goto(`https://cafe.naver.com/${cafe.cafeUrl}`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      await page.waitForTimeout(1000);

      const liveDetails = await fetchLiveDetails(
        page,
        cafe.cafeId,
        cafeArticles.map(({ articleId }) => articleId)
      );
      const liveByArticleId = new Map(liveDetails.map((detail) => [detail.articleId, detail]));

      for (const article of cafeArticles) {
        const live = liveByArticleId.get(article.articleId);
        const liveTimestamp = live?.writeTimestamp;
        const dbDate = toKstDateKey(article.publishedAt);
        const dbTime = toKstMinute(article.publishedAt);
        const liveDate = liveTimestamp ? toKstDateKey(liveTimestamp) : '';
        const liveTime = liveTimestamp ? toKstMinute(liveTimestamp) : '';
        const liveTitle = live?.subject || '';
        const rowBase = {
          liveOk: Boolean(live?.ok),
          dbTitle: article.title || '',
          liveTitle,
          dbDate,
          liveDate,
        };

        rows.push({
          cafeName: cafe.name,
          cafeId: cafe.cafeId,
          articleId: article.articleId,
          keyword: article.keyword || '',
          postType: article.postType || 'unknown',
          writerAccountId: article.writerAccountId || '',
          dbTitle: article.title || '',
          dbDate,
          dbTime,
          articleUrl:
            article.articleUrl ||
            `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}/articles/${article.articleId}`,
          liveOk: Boolean(live?.ok),
          liveTitle,
          liveMenuName: live?.menuName || '',
          liveNickname: live?.nickname || '',
          liveCommentCount:
            typeof live?.commentCount === 'number' ? live.commentCount : null,
          liveDate,
          liveTime,
          issue: getIssue(rowBase),
        });
      }
    }

    await saveCookiesForAccount(viewer.accountId);
  } finally {
    releaseAccountLock(viewer.accountId);
  }

  rows.sort((a, b) =>
    [a.cafeName, a.dbTime, String(a.articleId)].join('|').localeCompare(
      [b.cafeName, b.dbTime, String(b.articleId)].join('|')
    )
  );

  const summary = CAFES.map((cafe) => {
    const cafeRows = rows.filter(({ cafeId }) => cafeId === cafe.cafeId);
    const byDateType = new Map<string, number>();
    for (const row of cafeRows) {
      const key = `${row.dbDate}:${row.postType}`;
      byDateType.set(key, (byDateType.get(key) || 0) + 1);
    }

    return {
      cafeName: cafe.name,
      cafeId: cafe.cafeId,
      total: cafeRows.length,
      liveOk: cafeRows.filter(({ liveOk }) => liveOk).length,
      issues: cafeRows.filter(({ issue }) => issue).length,
      byDateType: Object.fromEntries([...byDateType.entries()].sort()),
    };
  });

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifactBase = `${ARTIFACT_DIR}/cafe-week-keywords-${START_DATE}_${END_DATE}`;
  const jsonPath = `${artifactBase}.json`;
  const csvPath = `${artifactBase}.csv`;

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        range: { startDate: START_DATE, endDate: END_DATE, timezone: 'Asia/Seoul' },
        cafes: CAFES,
        summary,
        rows,
      },
      null,
      2
    )
  );

  const csvHeader = [
    'cafeName',
    'dbDate',
    'dbTime',
    'postType',
    'keyword',
    'articleId',
    'writerAccountId',
    'liveOk',
    'issue',
    'liveMenuName',
    'dbTitle',
    'liveTitle',
    'articleUrl',
  ];
  const csvLines = [
    csvHeader.join(','),
    ...rows.map((row) =>
      csvHeader.map((key) => csvEscape(row[key as keyof ReviewRow])).join(',')
    ),
  ];
  writeFileSync(csvPath, `${csvLines.join('\n')}\n`);

  console.log('\n=== SUMMARY ===');
  for (const cafe of summary) {
    console.log(
      `${cafe.cafeName}: total=${cafe.total}, liveOk=${cafe.liveOk}, issues=${cafe.issues}`
    );
    for (const [key, count] of Object.entries(cafe.byDateType)) {
      console.log(`  ${key} ${count}`);
    }
  }

  const issueRows = rows.filter(({ issue }) => issue);
  if (issueRows.length > 0) {
    console.log('\n=== ISSUES ===');
    for (const row of issueRows.slice(0, 30)) {
      console.log(
        `${row.cafeName} ${row.dbTime} #${row.articleId} [${row.issue}] ${row.keyword}`
      );
    }
    if (issueRows.length > 30) {
      console.log(`... ${issueRows.length - 30} more`);
    }
  }

  console.log(`\n[JSON] ${jsonPath}`);
  console.log(`[CSV] ${csvPath}`);
};

main()
  .then(async () => {
    try {
      await closeAllContexts();
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await closeAllContexts();
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
