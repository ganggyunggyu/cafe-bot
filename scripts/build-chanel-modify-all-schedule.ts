/**
 * 샤넬 daily-ad 전체 수정 일정 생성
 *
 * 지정 Google Sheet의 미노출 키워드를 가져오고, DB의 샤넬 live/unmodified
 * daily-ad 글과 매칭해 scripts/run-modify.ts용 JSON 일정을 생성합니다.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/build-chanel-modify-all-schedule.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env", quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });

import { writeFileSync } from "fs";
import { google } from "googleapis";
import mongoose from "mongoose";
import type { Page } from "playwright";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models/published-article";
import { User } from "../src/shared/models/user";
import {
  acquireAccountLock,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from "../src/shared/lib/multi-session";

const DEFAULT_SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const DEFAULT_SHEET_GID = 1923976827;
const CAFE_ID = process.env.CHANEL_MODIFY_CAFE_ID || "25460974";
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const CHECKER_ACCOUNT = process.env.CHECKER_ACCOUNT || "8i2vlbym";
const OUTPUT_FILE =
  process.env.CHANEL_MODIFY_SCHEDULE_OUTPUT ||
  "/tmp/chanel-modify-all-schedule.json";
const KEYWORD_REVIEW_FILE =
  process.env.CHANEL_MODIFY_KEYWORD_REVIEW_OUTPUT ||
  "/tmp/chanel-modify-all-keywords.txt";
const SHEET_ID = process.env.CHANEL_KEYWORD_SHEET_ID || DEFAULT_SHEET_ID;
const SHEET_GID = Number(
  process.env.CHANEL_KEYWORD_SHEET_GID || DEFAULT_SHEET_GID,
);
const SHEET_TAB = process.env.CHANEL_KEYWORD_SHEET_TAB || "";
const SCHEDULE_LIMIT = Number(process.env.CHANEL_MODIFY_SCHEDULE_LIMIT || 0);
const CHANEL_MODIFY_CATEGORY = "_ 일상샤반사 📆";
const PAGE_WAIT_MS = Number(process.env.CHANEL_MODIFY_VERIFY_WAIT_MS || 500);
const KEYWORD_FAMILY_WINDOW = Number(
  process.env.CHANEL_KEYWORD_FAMILY_WINDOW || 3,
);

interface KeywordRow {
  keyword: string;
  rowNumber: number;
  exposure: string;
}

interface ArticleRecord {
  articleId: number;
  cafeId: string;
  articleUrl?: string;
  writerAccountId: string;
  title?: string;
  keyword?: string;
  createdAt?: Date;
}

interface ModifyItem {
  link: string;
  keyword: string;
  keywordType: "own" | "competitor";
  category: string;
}

interface ArticleApiResult {
  ok: boolean;
  status?: number;
  title?: string;
  reason?: string;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} missing`);
  }
  return value;
};

const normalizeCell = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeHeader = (value: string): string =>
  value.replace(/\s+/g, "").trim();

const isPositiveExposure = (value: string): boolean =>
  /^(o|ok|y|yes|true|1|노출|상위노출|완료)$/i.test(value.trim());

const isUnexposed = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (isPositiveExposure(trimmed)) return false;
  return /^(x|n|no|false|0|미노출|누락)$/i.test(trimmed);
};

const getKeywordFamily = (keyword: string): string => {
  const compact = keyword.replace(/\s+/g, "").toLowerCase();
  if (/계류유산|화학적유산|유산|임신|시험관|배란|임테기|착상|난임|산전|출산|산후/.test(compact)) {
    return "임신/난임";
  }
  if (/어버이날|선물|엄마|아빠|부모님|할머니|할아버지|여자선물|남자선물/.test(compact)) {
    return "선물";
  }
  if (/흑염소|마가목|홍삼|쌍화|공진단|녹용|침향|보양|기력|영양제|비타민|엽산|칼슘|유산균|건강식품|자라탕|개구리즙|잉어즙/.test(compact)) {
    return "건강식품/보양";
  }

  const token = keyword
    .trim()
    .split(/[\s/,_-]+/)
    .find((part) => part.trim().length > 0);
  return token ? token.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase() : compact;
};

const violatesKeywordWindow = (
  selected: KeywordRow[],
  candidate: KeywordRow,
): boolean => {
  const family = getKeywordFamily(candidate.keyword);
  return selected
    .slice(Math.max(0, selected.length - (KEYWORD_FAMILY_WINDOW - 1)))
    .some((item) => getKeywordFamily(item.keyword) === family);
};

const getColumnIndex = (
  headers: string[],
  candidates: string[],
  fallback: number,
): number => {
  const normalizedCandidates = candidates.map(normalizeHeader);
  const index = headers.findIndex((header) =>
    normalizedCandidates.includes(normalizeHeader(header)),
  );
  return index >= 0 ? index : fallback;
};

const quoteSheetName = (sheetName: string): string =>
  `'${sheetName.replace(/'/g, "''")}'`;

const createSheetsClient = () => {
  const email = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = requireEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
};

const resolveSheetTab = async (): Promise<string> => {
  if (SHEET_TAB) return SHEET_TAB;

  const sheets = createSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const target = meta.data.sheets?.find(
    ({ properties }) => properties?.sheetId === SHEET_GID,
  );

  const title = target?.properties?.title;
  if (!title) {
    throw new Error(`sheet tab not found: gid=${SHEET_GID}`);
  }

  return title;
};

const readUnexposedKeywords = async (): Promise<KeywordRow[]> => {
  const sheets = createSheetsClient();
  const sheetTab = await resolveSheetTab();
  const range = `${quoteSheetName(sheetTab)}!A:Z`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });
  const rows = response.data.values || [];
  if (rows.length === 0) {
    throw new Error(`sheet has no rows: ${sheetTab}`);
  }

  const headers = (rows[0] || []).map(normalizeCell);
  const keywordIndex = getColumnIndex(headers, ["키워드", "keyword"], 0);
  const exposureIndex = getColumnIndex(
    headers,
    ["노출여부", "노출 여부", "exposure", "status"],
    1,
  );
  const seen = new Set<string>();
  const keywords: KeywordRow[] = [];

  rows.slice(1).forEach((row, index) => {
    const keyword = normalizeCell(row[keywordIndex]);
    const exposure = normalizeCell(row[exposureIndex]);
    if (!keyword || !isUnexposed(exposure) || seen.has(keyword)) {
      return;
    }

    seen.add(keyword);
    keywords.push({
      keyword,
      rowNumber: index + 2,
      exposure,
    });
  });

  console.log(
    `[CHANEL_SCHEDULE] keyword source: ${sheetTab} / unexposed=${keywords.length}`,
  );
  return keywords;
};

const getUnmodifiedDailyAds = async (): Promise<ArticleRecord[]> => {
  const articles = await PublishedArticle.find({
    cafeId: CAFE_ID,
    postType: "daily-ad",
    status: { $ne: "modified" },
  })
    .select({
      articleId: 1,
      cafeId: 1,
      articleUrl: 1,
      writerAccountId: 1,
      title: 1,
      keyword: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1, articleId: -1 })
    .lean<ArticleRecord[]>();

  console.log(`[CHANEL_SCHEDULE] DB unmodified daily-ad=${articles.length}`);
  return articles;
};

const fetchArticleState = async (
  page: Page,
  articleId: number,
): Promise<ArticleApiResult> => {
  await page
    .goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${articleId}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    })
    .catch(() => {});
  await page.waitForTimeout(PAGE_WAIT_MS);

  return page.evaluate(
    async ({ cafeId, targetArticleId }) => {
      const response = await fetch(
        `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${cafeId}/articles/${targetArticleId}?useCafeId=true`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          reason: `article API ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        result?: { article?: { subject?: string } };
      };
      const article = data.result?.article;
      if (!article) {
        return {
          ok: false,
          status: response.status,
          reason: "article API 응답에 article 없음",
        };
      }

      return {
        ok: true,
        status: response.status,
        title: article.subject || "",
      };
    },
    { cafeId: CAFE_ID, targetArticleId: articleId },
  );
};

const filterLiveArticles = async (
  articles: ArticleRecord[],
): Promise<ArticleRecord[]> => {
  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();
  const accountMap = new Map(accounts.map((account) => [account.accountId, account]));
  const checker =
    accountMap.get(CHECKER_ACCOUNT) ||
    articles.map((article) => accountMap.get(article.writerAccountId)).find(Boolean) ||
    accounts.find((account) => account.role === "writer") ||
    accounts[0];
  if (!checker) throw new Error(`checker account not found: ${CHECKER_ACCOUNT}`);
  if (checker.accountId !== CHECKER_ACCOUNT) {
    console.log(
      `[CHANEL_SCHEDULE] checker fallback: ${CHECKER_ACCOUNT} -> ${checker.accountId}`,
    );
  }

  const liveArticles: ArticleRecord[] = [];

  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(
        checker.accountId,
        checker.password,
      );
      if (!loginResult.success) {
        throw new Error(`login failed: ${loginResult.error}`);
      }
    }

    const page = await getPageForAccount(checker.accountId);
    for (const article of articles) {
      const state = await fetchArticleState(page, article.articleId);
      if (!state.ok) {
        console.log(
          `[CHANEL_SCHEDULE] skip #${article.articleId}: ${state.reason || state.status}`,
        );
        continue;
      }

      liveArticles.push(article);
      console.log(
        `[CHANEL_SCHEDULE] live #${article.articleId}: ${(state.title || article.title || "").slice(0, 35)}`,
      );
    }

    await saveCookiesForAccount(checker.accountId);
  } finally {
    releaseAccountLock(checker.accountId);
  }

  console.log(`[CHANEL_SCHEDULE] live unmodified=${liveArticles.length}`);
  return liveArticles;
};

const buildSchedule = (
  articles: ArticleRecord[],
  keywords: KeywordRow[],
): ModifyItem[] => {
  const limit = SCHEDULE_LIMIT > 0 ? Math.min(SCHEDULE_LIMIT, articles.length) : articles.length;

  if (keywords.length < limit) {
    throw new Error(
      `미노출 키워드 부족: keywords=${keywords.length}, targets=${limit}`,
    );
  }

  const selectedKeywords: KeywordRow[] = [];
  const remainingKeywords = [...keywords];

  while (selectedKeywords.length < limit) {
    const candidateIndex = remainingKeywords.findIndex(
      (keyword) => !violatesKeywordWindow(selectedKeywords, keyword),
    );

    if (candidateIndex < 0) {
      throw new Error(
        `키워드군 분산 실패: 최근 ${KEYWORD_FAMILY_WINDOW}개 내 동일 주제군 반복 없이 ${limit}개를 만들 수 없음`,
      );
    }

    const [candidate] = remainingKeywords.splice(candidateIndex, 1);
    selectedKeywords.push(candidate);
  }

  return articles.slice(0, limit).map((article, index) => ({
    link:
      article.articleUrl ||
      `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${article.articleId}`,
    keyword: selectedKeywords[index].keyword,
    keywordType: "own",
    category: CHANEL_MODIFY_CATEGORY,
  }));
};

const writeOutputs = (schedule: ModifyItem[]): void => {
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
  writeFileSync(
    KEYWORD_REVIEW_FILE,
    `${schedule
      .map(
        (item, index) =>
          `${index + 1}. #${item.link.split("/").pop()} ${item.keyword} (${getKeywordFamily(item.keyword)})`,
      )
      .join("\n")}\n`,
    "utf8",
  );
};

const main = async (): Promise<void> => {
  const MONGODB_URI = requireEnv("MONGODB_URI");
  const keywords = await readUnexposedKeywords();

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const candidates = await getUnmodifiedDailyAds();
    const liveArticles = await filterLiveArticles(candidates);
    const schedule = buildSchedule(liveArticles, keywords);
    writeOutputs(schedule);

    console.log(`\n=== 샤넬 수정 일정 생성 완료 ===`);
    console.log(`대상 글: ${schedule.length}건`);
    console.log(`일정 파일: ${OUTPUT_FILE}`);
    console.log(`검토 파일: ${KEYWORD_REVIEW_FILE}`);
    console.log(`\n=== 검토 키워드 ===`);
    schedule.forEach((item, index) => {
      console.log(`${index + 1}. ${item.keyword} (${getKeywordFamily(item.keyword)})`);
    });
  } finally {
    await mongoose.disconnect();
  }
};

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(
      `[CHANEL_SCHEDULE] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
