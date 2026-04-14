import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeWriterAccounts } from '@/shared/config/cafe-account-policy';
import { getAllCafes } from '@/shared/config/cafes';
import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';
import { connectDB } from '@/shared/lib/mongodb';
import { User } from '@/shared/models/user';

import {
  getDefaultTargetForCafe,
  getTodayKstDateKey,
  shiftKstDateKey,
  toKstDateKey,
  type TargetInfo,
  type TargetStatus,
} from './verify-cafe-posts';

dotenv.config({ path: '.env.local' });

const DEFAULT_PAGE_LIMIT = 20;
const DEFAULT_MEMBER_PER_PAGE = 15;
const HELP_TEXT = `
실카페 기준 카페 글 목표치 점검

사용법
  npx tsx --env-file=.env.local scripts/verify-cafe-goals-live.ts [옵션]

옵션
  --login-id <loginId>            사용자 loginId. 기본값: 21lab
  --cafe <token>                  cafeId, 카페명, cafeUrl 일부 문자열로 필터
  --date <YYYY-MM-DD>             기준일(KST). 기본값: 오늘
  --page-limit <n>                카페 글 목록 조회 페이지 수. 기본 20
  --show-posts                    날짜별 실제 잡힌 글 목록 출력
  --json                          JSON 출력
  --help                          도움말

예시
  npx tsx --env-file=.env.local scripts/verify-cafe-goals-live.ts \\
    --date 2026-04-14 \\
    --show-posts
`.trim();

interface LiveVerifyArgs {
  loginId: string;
  cafes: string[];
  baseDateKey: string;
  pageLimit: number;
  showPosts: boolean;
  json: boolean;
  help: boolean;
}

interface LiveArticleRecord {
  articleId: number;
  subject: string;
  nickname: string;
  memberKey?: string;
  maskedMemberId?: string;
  writeDateTimestamp: number;
  cafeId?: string;
  cafeName?: string;
}

interface LiveDaySummary {
  dateKey: string;
  actualPosts: number;
  target: TargetInfo | null;
  targetStatus: TargetStatus;
  diffFromTarget: number | null;
  statusReason: string | null;
  writerBreakdown: Array<{ nickname: string; posts: number }>;
  posts: LiveArticleRecord[];
}

type LiveEvidenceSource = 'global_article_list' | 'member_article_list';
type LiveCollectionStopReason =
  | 'reached_date_window'
  | 'exhausted_list'
  | 'page_limit'
  | 'browse_error'
  | 'identity_only';

interface LiveCollectionMeta {
  evidenceSource: LiveEvidenceSource;
  pageLimit: number;
  perPage: number;
  pagesScanned: number;
  identityExpected: number;
  identityResolved: number;
  identityFailures: string[];
  todayCovered: boolean;
  previousCovered: boolean;
  newestObservedDateKey: string | null;
  oldestObservedDateKey: string | null;
  stopReason: LiveCollectionStopReason;
  errors: string[];
}

interface LiveDayAssessment {
  coverageComplete: boolean;
  identityExpected: number;
  identityResolved: number;
  collectionErrors: string[];
}

interface LiveCafeSummary {
  cafeId: string;
  cafeName: string;
  cafeUrl: string;
  eligibleNicknames: string[];
  collection: LiveCollectionMeta;
  yesterday: LiveDaySummary;
  today: LiveDaySummary;
}

interface LiveVerificationReport {
  source: 'live_cafe_member_article_list';
  generatedAt: string;
  loginId: string;
  baseDateKey: string;
  previousDateKey: string;
  cafes: LiveCafeSummary[];
}

interface CafeViewerIdentity {
  accountId: string;
  nickname?: string;
  memberKey: string;
}

const parseInteger = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flag} 값이 숫자가 아닙니다: ${value}`);
  }

  return parsed;
};

const matchesCafeToken = (
  cafe: { cafeId: string; name: string; cafeUrl?: string },
  token: string,
): boolean => {
  const loweredToken = token.toLowerCase();
  return [cafe.cafeId, cafe.name, cafe.cafeUrl || ''].some((value) =>
    value.toLowerCase().includes(loweredToken),
  );
};

export const filterOwnedArticlesByDate = (
  articles: LiveArticleRecord[],
  ownedMemberKeys: Set<string>,
  dateKey: string,
): LiveArticleRecord[] =>
  articles
    .filter(({ memberKey, writeDateTimestamp }) => {
      if (toKstDateKey(new Date(writeDateTimestamp)) !== dateKey) {
        return false;
      }

      return Boolean(memberKey && ownedMemberKeys.has(memberKey));
    })
    .sort((left, right) => left.writeDateTimestamp - right.writeDateTimestamp);

const buildWriterBreakdown = (
  posts: LiveArticleRecord[],
): Array<{ nickname: string; posts: number }> => {
  const counts = new Map<string, number>();

  for (const { nickname } of posts) {
    counts.set(nickname, (counts.get(nickname) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([nickname, postCount]) => ({ nickname, posts: postCount }))
    .sort((left, right) => right.posts - left.posts || left.nickname.localeCompare(right.nickname, 'ko'));
};

const createCollectionMeta = (identityExpected: number, pageLimit: number): LiveCollectionMeta => ({
  evidenceSource: 'member_article_list',
  pageLimit,
  perPage: DEFAULT_MEMBER_PER_PAGE,
  pagesScanned: 0,
  identityExpected,
  identityResolved: 0,
  identityFailures: [],
  todayCovered: false,
  previousCovered: false,
  newestObservedDateKey: null,
  oldestObservedDateKey: null,
  stopReason: 'page_limit',
  errors: [],
});

const buildUnknownReason = (
  target: TargetInfo | null,
  assessment: LiveDayAssessment,
): string | null => {
  if (!target) {
    return '목표 미지정';
  }

  if (
    assessment.identityExpected > 0 &&
    assessment.identityResolved < assessment.identityExpected
  ) {
    return `writer identity ${assessment.identityResolved}/${assessment.identityExpected}만 확인됨`;
  }

  if (assessment.collectionErrors.length > 0) {
    return assessment.collectionErrors[0];
  }

  if (!assessment.coverageComplete) {
    return '조회 범위가 날짜 끝까지 내려가지 않음';
  }

  return null;
};

export const buildLiveDaySummary = (
  dateKey: string,
  posts: LiveArticleRecord[],
  target: TargetInfo | null,
  assessment: LiveDayAssessment,
): LiveDaySummary => {
  const actualPosts = posts.length;
  const unknownReason = buildUnknownReason(target, assessment);
  const targetStatus = unknownReason
    ? 'unknown'
    : target && actualPosts >= target.value ? 'pass' : 'fail';
  const diffFromTarget = target && !unknownReason ? actualPosts - target.value : null;
  const statusReason = unknownReason || (targetStatus === 'fail' ? '목표 미달' : null);

  return {
    dateKey,
    actualPosts,
    target,
    targetStatus,
    diffFromTarget,
    statusReason,
    writerBreakdown: buildWriterBreakdown(posts),
    posts,
  };
};

const parseArgs = (argv: string[]): LiveVerifyArgs => {
  const args: LiveVerifyArgs = {
    loginId: '21lab',
    cafes: [],
    baseDateKey: getTodayKstDateKey(),
    pageLimit: DEFAULT_PAGE_LIMIT,
    showPosts: false,
    json: false,
    help: false,
  };

  const tokens = [...argv];

  while (tokens.length > 0) {
    const token = tokens.shift();

    if (!token) continue;

    if (token === '--help') {
      args.help = true;
      continue;
    }

    if (token === '--show-posts') {
      args.showPosts = true;
      continue;
    }

    if (token === '--json') {
      args.json = true;
      continue;
    }

    const value = tokens.shift();
    if (!value) {
      throw new Error(`${token} 값이 비었습니다`);
    }

    if (token === '--login-id') {
      args.loginId = value;
      continue;
    }

    if (token === '--cafe') {
      args.cafes.push(value);
      continue;
    }

    if (token === '--date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`--date 형식이 잘못됐습니다: ${value}`);
      }
      args.baseDateKey = value;
      continue;
    }

    if (token === '--page-limit') {
      args.pageLimit = parseInteger(value, '--page-limit');
      continue;
    }

    throw new Error(`알 수 없는 옵션입니다: ${token}`);
  }

  return args;
};

const formatKstTime = (timestamp: number): string => {
  const date = new Date(timestamp + (9 * 60 * 60 * 1000));
  return date.toISOString().slice(11, 16);
};

const formatStatusLabel = (targetStatus: TargetStatus): string => {
  if (targetStatus === 'pass') {
    return 'PASS';
  }

  if (targetStatus === 'fail') {
    return 'FAIL';
  }

  return 'UNKNOWN';
};

const formatTargetLine = (label: string, summary: LiveDaySummary): string => {
  if (!summary.target) {
    return `${label} ${summary.dateKey} | 목표 미지정 | 실제 ${summary.actualPosts}건`;
  }

  const statusLabel = formatStatusLabel(summary.targetStatus);
  const diffLabel = summary.diffFromTarget && summary.diffFromTarget !== 0
    ? ` (${summary.diffFromTarget > 0 ? `+${summary.diffFromTarget}` : summary.diffFromTarget})`
    : '';
  const reasonLabel = summary.statusReason ? ` | 사유 ${summary.statusReason}` : '';

  return `${label} ${summary.dateKey} | ${statusLabel} | 목표 ${summary.target.value}건 / 실제 ${summary.actualPosts}건${diffLabel}${reasonLabel}`;
};

const formatWriterBreakdown = (writerBreakdown: Array<{ nickname: string; posts: number }>): string => {
  if (writerBreakdown.length === 0) {
    return '작성 글 없음';
  }

  return writerBreakdown.map(({ nickname, posts }) => `${nickname}(${posts})`).join(', ');
};

const renderPosts = (summary: LiveDaySummary): string[] => {
  if (summary.posts.length === 0) {
    return ['    - 없음'];
  }

  return summary.posts.map(({ articleId, nickname, subject, writeDateTimestamp }) =>
    `    - ${formatKstTime(writeDateTimestamp)} [${nickname}] #${articleId} ${subject}`,
  );
};

const formatCollectionSummary = (collection: LiveCollectionMeta): string =>
  [
    `근거 ${collection.evidenceSource}`,
    `writer identity ${collection.identityResolved}/${collection.identityExpected}`,
    `pages ${collection.pagesScanned}/${collection.pageLimit}`,
    `금일범위 ${collection.todayCovered ? '완료' : '미완료'}`,
    `전일범위 ${collection.previousCovered ? '완료' : '미완료'}`,
    `종료 ${collection.stopReason}`,
  ].join(' | ');

const renderReport = (report: LiveVerificationReport, showPosts: boolean): string => {
  const lines = [
    '=== 카페 실접속 목표치 점검 ===',
    `source: ${report.source}`,
    `생성시각: ${report.generatedAt}`,
    `기준일: ${report.baseDateKey} | 전일: ${report.previousDateKey}`,
    '',
  ];

  for (const cafe of report.cafes) {
    lines.push(
      `## ${cafe.cafeName} (${cafe.cafeId})`,
      `조회 카페 URL: https://cafe.naver.com/${cafe.cafeUrl}`,
      `글쓰기 닉네임: ${cafe.eligibleNicknames.join(', ') || '(없음)'}`,
      `수집 메타: ${formatCollectionSummary(cafe.collection)}`,
      `  ${formatTargetLine('전일', cafe.yesterday)}`,
      `  작성자 분포: ${formatWriterBreakdown(cafe.yesterday.writerBreakdown)}`,
      `  ${formatTargetLine('금일', cafe.today)}`,
      `  작성자 분포: ${formatWriterBreakdown(cafe.today.writerBreakdown)}`,
    );

    if (cafe.collection.oldestObservedDateKey || cafe.collection.newestObservedDateKey) {
      lines.push(
        `  관측 날짜 범위: ${cafe.collection.newestObservedDateKey || '-'} -> ${cafe.collection.oldestObservedDateKey || '-'}`,
      );
    }

    if (cafe.collection.identityFailures.length > 0) {
      lines.push(`  identity 실패: ${cafe.collection.identityFailures.join(' | ')}`);
    }

    if (cafe.collection.errors.length > 0) {
      lines.push(`  수집 오류: ${cafe.collection.errors.join(' | ')}`);
    }

    if (showPosts || cafe.yesterday.targetStatus !== 'pass') {
      lines.push('  전일 실제 글:');
      lines.push(...renderPosts(cafe.yesterday));
    }

    if (showPosts || cafe.today.targetStatus !== 'pass') {
      lines.push('  금일 실제 글:');
      lines.push(...renderPosts(cafe.today));
    }

    lines.push('');
  }

  return lines.join('\n').trim();
};

const isDirectExecution = (): boolean => {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPoint).href;
};

const getCafeViewerIdentity = async (
  account: { id: string; password: string; nickname?: string },
  cafe: { cafeId: string; cafeUrl: string; name: string },
): Promise<CafeViewerIdentity> => {
  await acquireAccountLock(account.id);

  try {
    const loggedIn = await isAccountLoggedIn(account.id);
    if (!loggedIn) {
      const loginResult = await loginAccount(account.id, account.password);
      if (!loginResult.success) {
        throw new Error(loginResult.error || '로그인 실패');
      }
    }

    const page = await getPageForAccount(account.id);
    await page.goto(`https://cafe.naver.com/${cafe.cafeUrl}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    const identity = await page.evaluate(() => {
      const globalScope = window as typeof window & {
        g_sUserMemberKey?: string;
      };

      return {
        memberKey: globalScope.g_sUserMemberKey || '',
      };
    });

    if (!identity.memberKey) {
      throw new Error('카페 memberKey를 찾지 못했습니다');
    }

    await saveCookiesForAccount(account.id);

    return {
      accountId: account.id,
      nickname: account.nickname,
      memberKey: identity.memberKey,
    };
  } finally {
    releaseAccountLock(account.id);
  }
};

interface MemberArticleListItem {
  articleId?: number;
  articleid?: number;
  subject?: string;
  title?: string;
  writerNickname?: string;
  writernickname?: string;
  nickname?: string;
  maskedMemberId?: string;
  maskedMemberid?: string;
  writerMemberKey?: string;
  writerMemberkey?: string;
  memberKey?: string;
  memberkey?: string;
  writeDateTimestamp?: number | string;
  writeDate?: number | string;
}

interface MemberArticleCollectionResult {
  articles: LiveArticleRecord[];
  pagesScanned: number;
  todayCovered: boolean;
  previousCovered: boolean;
  newestObservedDateKey: string | null;
  oldestObservedDateKey: string | null;
  stopReason: Exclude<LiveCollectionStopReason, 'identity_only'>;
  error?: string;
}

const parseTimestamp = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
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

const collectCafeMemberArticles = async (
  account: { id: string; password: string; nickname?: string },
  cafe: { cafeId: string; cafeUrl: string; name: string },
  memberKey: string,
  baseDateKey: string,
  previousDateKey: string,
  pageLimit: number,
): Promise<MemberArticleCollectionResult> => {
  await acquireAccountLock(account.id);

  try {
    const loggedIn = await isAccountLoggedIn(account.id);
    if (!loggedIn) {
      const loginResult = await loginAccount(account.id, account.password);
      if (!loginResult.success) {
        return {
          articles: [],
          pagesScanned: 0,
          todayCovered: false,
          previousCovered: false,
          newestObservedDateKey: null,
          oldestObservedDateKey: null,
          stopReason: 'browse_error',
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(account.id);
    await page.goto(`https://cafe.naver.com/f-e/cafes/${cafe.cafeId}/members/${memberKey}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    const articles: LiveArticleRecord[] = [];
    const seenArticleIds = new Set<number>();
    let pagesScanned = 0;
    let todayCovered = false;
    let previousCovered = false;
    let newestObservedDateKey: string | null = null;
    let oldestObservedDateKey: string | null = null;
    let stopReason: Exclude<LiveCollectionStopReason, 'identity_only'> = 'page_limit';

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const apiUrl =
        `https://apis.naver.com/cafe-web/cafe-mobile/CafeMemberNetworkArticleListV3` +
        `?search.cafeId=${cafe.cafeId}` +
        `&search.memberKey=${encodeURIComponent(memberKey)}` +
        `&search.perPage=${DEFAULT_MEMBER_PER_PAGE}` +
        `&search.page=${pageNumber}` +
        `&requestFrom=A`;

      const apiResult = await page.evaluate(async (url: string) => {
        try {
          const response = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {
            return { error: `HTTP ${response.status}` };
          }
          return await response.json();
        } catch (error) {
          return { error: String(error) };
        }
      }, apiUrl);

      if ('error' in apiResult && apiResult.error) {
        return {
          articles,
          pagesScanned,
          todayCovered,
          previousCovered,
          newestObservedDateKey,
          oldestObservedDateKey,
          stopReason: 'browse_error',
          error: String(apiResult.error),
        };
      }

      const response = apiResult as {
        message?: {
          status?: string;
          error?: { msg?: string };
          result?: {
            articleList?: MemberArticleListItem[];
            memberArticleList?: MemberArticleListItem[];
            list?: MemberArticleListItem[];
          };
        };
        result?: {
          articleList?: MemberArticleListItem[];
          memberArticleList?: MemberArticleListItem[];
          list?: MemberArticleListItem[];
        };
      };
      const status = response.message?.status;
      if (status && status !== '200') {
        return {
          articles,
          pagesScanned,
          todayCovered,
          previousCovered,
          newestObservedDateKey,
          oldestObservedDateKey,
          stopReason: 'browse_error',
          error: response.message?.error?.msg || `API status: ${status}`,
        };
      }

      const rawArticles =
        response.message?.result?.articleList ||
        response.message?.result?.memberArticleList ||
        response.message?.result?.list ||
        response.result?.articleList ||
        response.result?.memberArticleList ||
        response.result?.list ||
        [];

      pagesScanned = pageNumber;

      if (rawArticles.length === 0) {
        todayCovered = true;
        previousCovered = true;
        stopReason = 'exhausted_list';
        break;
      }

      for (const item of rawArticles) {
        const articleId = item.articleId ?? item.articleid;
        if (!articleId || seenArticleIds.has(articleId)) {
          continue;
        }

        const writeDateTimestamp = parseTimestamp(item.writeDateTimestamp ?? item.writeDate);
        if (!writeDateTimestamp) {
          continue;
        }

        seenArticleIds.add(articleId);
        articles.push({
          articleId,
          subject: item.subject || item.title || '',
          nickname: item.writerNickname || item.writernickname || item.nickname || item.maskedMemberId || item.maskedMemberid || '',
          memberKey: item.writerMemberKey || item.writerMemberkey || item.memberKey || item.memberkey || memberKey,
          maskedMemberId: item.maskedMemberId || item.maskedMemberid,
          writeDateTimestamp,
          cafeId: cafe.cafeId,
          cafeName: cafe.name,
        });
      }

      const pageDateKeys = rawArticles
        .map((item) => parseTimestamp(item.writeDateTimestamp ?? item.writeDate))
        .filter((timestamp) => timestamp > 0)
        .map((timestamp) => toKstDateKey(new Date(timestamp)));
      const oldestDateKey = pageDateKeys.reduce((oldest, dateKey) => {
        return !oldest || dateKey < oldest ? dateKey : oldest;
      }, '');
      const newestDateKey = pageDateKeys.reduce((newest, dateKey) => {
        return !newest || dateKey > newest ? dateKey : newest;
      }, '');

      if (newestDateKey && (!newestObservedDateKey || newestDateKey > newestObservedDateKey)) {
        newestObservedDateKey = newestDateKey;
      }

      if (oldestDateKey && (!oldestObservedDateKey || oldestDateKey < oldestObservedDateKey)) {
        oldestObservedDateKey = oldestDateKey;
      }

      if (oldestDateKey && oldestDateKey < baseDateKey) {
        todayCovered = true;
      }

      if (oldestDateKey && oldestDateKey < previousDateKey) {
        previousCovered = true;
        stopReason = 'reached_date_window';
        break;
      }

      if (rawArticles.length < DEFAULT_MEMBER_PER_PAGE) {
        todayCovered = true;
        previousCovered = true;
        stopReason = 'exhausted_list';
        break;
      }
    }

    await saveCookiesForAccount(account.id);

    return {
      articles,
      pagesScanned,
      todayCovered,
      previousCovered,
      newestObservedDateKey,
      oldestObservedDateKey,
      stopReason,
    };
  } finally {
    releaseAccountLock(account.id);
  }
};

const loadReport = async (args: LiveVerifyArgs): Promise<LiveVerificationReport> => {
  await connectDB();

  const user = await User.findOne({ loginId: args.loginId, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${args.loginId}`);
  }

  const [accounts, cafes] = await Promise.all([
    getAllAccounts(user.userId),
    getAllCafes(user.userId),
  ]);

  const previousDateKey = shiftKstDateKey(args.baseDateKey, -1);
  const selectedCafes = cafes
    .filter((cafe) => getDefaultTargetForCafe({ cafeId: cafe.cafeId, name: cafe.name }) !== null)
    .filter((cafe) => args.cafes.length === 0 || args.cafes.some((token) => matchesCafeToken(cafe, token)));

  if (selectedCafes.length === 0) {
    throw new Error('조회할 카페가 없습니다');
  }

  const cafeSummaries: LiveCafeSummary[] = [];

  for (const cafe of selectedCafes) {
    const writerAccounts = getCafeWriterAccounts(accounts, cafe.cafeId);
    const eligibleNicknames = [...new Set(
      writerAccounts
        .map(({ nickname }) => nickname?.trim())
        .filter((nickname): nickname is string => Boolean(nickname)),
    )];
    const collection = createCollectionMeta(writerAccounts.length, args.pageLimit);
    const viewerIdentities: CafeViewerIdentity[] = [];
    const identityFailures: string[] = [];
    const collectedArticles: LiveArticleRecord[] = [];
    const seenArticleIds = new Set<number>();

    if (writerAccounts.length === 0) {
      collection.errors.push('글쓰기 계정이 없습니다');
      collection.stopReason = 'identity_only';
    }

    if (writerAccounts.length > 0) {
      for (const writerAccount of writerAccounts) {
        try {
          const identity = await getCafeViewerIdentity(writerAccount, cafe);
          viewerIdentities.push(identity);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          identityFailures.push(`${writerAccount.id}: ${message}`);
        }
      }
      collection.identityResolved = viewerIdentities.length;
      collection.identityFailures = identityFailures;

      if (viewerIdentities.length === 0) {
        collection.errors.push('writer 계정 로그인에 전부 실패함');
        collection.stopReason = 'identity_only';
      } else {
        collection.todayCovered = true;
        collection.previousCovered = true;
        const stopReasons = new Set<Exclude<LiveCollectionStopReason, 'identity_only'>>();

        for (const identity of viewerIdentities) {
          const writerAccount = writerAccounts.find(({ id }) => id === identity.accountId);
          if (!writerAccount) {
            collection.errors.push(`${identity.accountId}: 글쓰기 계정 설정을 찾지 못함`);
            collection.todayCovered = false;
            collection.previousCovered = false;
            stopReasons.add('browse_error');
            continue;
          }

          const writerResult = await collectCafeMemberArticles(
            writerAccount,
            cafe,
            identity.memberKey,
            args.baseDateKey,
            previousDateKey,
            args.pageLimit,
          );

          collection.pagesScanned += writerResult.pagesScanned;
          collection.todayCovered = collection.todayCovered && writerResult.todayCovered;
          collection.previousCovered = collection.previousCovered && writerResult.previousCovered;

          if (
            writerResult.newestObservedDateKey &&
            (!collection.newestObservedDateKey || writerResult.newestObservedDateKey > collection.newestObservedDateKey)
          ) {
            collection.newestObservedDateKey = writerResult.newestObservedDateKey;
          }

          if (
            writerResult.oldestObservedDateKey &&
            (!collection.oldestObservedDateKey || writerResult.oldestObservedDateKey < collection.oldestObservedDateKey)
          ) {
            collection.oldestObservedDateKey = writerResult.oldestObservedDateKey;
          }

          if (writerResult.error) {
            collection.errors.push(`${writerAccount.id}: ${writerResult.error}`);
            stopReasons.add('browse_error');
            continue;
          }

          stopReasons.add(writerResult.stopReason);

          for (const article of writerResult.articles) {
            if (seenArticleIds.has(article.articleId)) {
              continue;
            }
            seenArticleIds.add(article.articleId);
            collectedArticles.push(article);
          }
        }

        if (stopReasons.has('browse_error')) {
          collection.stopReason = 'browse_error';
        } else if (stopReasons.has('page_limit')) {
          collection.stopReason = 'page_limit';
        } else if (stopReasons.has('reached_date_window')) {
          collection.stopReason = 'reached_date_window';
        } else if (stopReasons.has('exhausted_list')) {
          collection.stopReason = 'exhausted_list';
        }
      }
    }

    const ownedMemberKeys = new Set(viewerIdentities.map(({ memberKey }) => memberKey));
    const yesterdayPosts = filterOwnedArticlesByDate(
      collectedArticles,
      ownedMemberKeys,
      previousDateKey,
    );
    const todayPosts = filterOwnedArticlesByDate(
      collectedArticles,
      ownedMemberKeys,
      args.baseDateKey,
    );

    cafeSummaries.push({
      cafeId: cafe.cafeId,
      cafeName: cafe.name,
      cafeUrl: cafe.cafeUrl,
      eligibleNicknames,
      collection,
      yesterday: buildLiveDaySummary(
        previousDateKey,
        yesterdayPosts,
        getDefaultTargetForCafe({ cafeId: cafe.cafeId, name: cafe.name }, 'yesterday'),
        {
          coverageComplete: collection.previousCovered,
          identityExpected: collection.identityExpected,
          identityResolved: collection.identityResolved,
          collectionErrors: collection.errors,
        },
      ),
      today: buildLiveDaySummary(
        args.baseDateKey,
        todayPosts,
        getDefaultTargetForCafe({ cafeId: cafe.cafeId, name: cafe.name }, 'today'),
        {
          coverageComplete: collection.todayCovered,
          identityExpected: collection.identityExpected,
          identityResolved: collection.identityResolved,
          collectionErrors: collection.errors,
        },
      ),
    });
  }

  return {
    source: 'live_cafe_member_article_list',
    generatedAt: new Date().toISOString(),
    loginId: args.loginId,
    baseDateKey: args.baseDateKey,
    previousDateKey,
    cafes: cafeSummaries,
  };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const report = await loadReport(args);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(renderReport(report, args.showPosts));
};

if (isDirectExecution()) {
  const run = async (): Promise<void> => {
    try {
      await main();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[VERIFY-CAFE-GOALS-LIVE] ${message}`);
      process.exitCode = 1;
    } finally {
      try {
        await closeAllContexts();
      } catch {}

      process.exit(process.exitCode || 0);
    }
  };

  void run();
}
