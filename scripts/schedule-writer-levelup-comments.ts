import mongoose from 'mongoose';
import { addTaskJob, getTaskQueue } from '../src/shared/lib/queue';
import { browseCafePosts, type CafeArticle } from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateComment } from '../src/shared/api/comment-gen-api';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { DailyActivity } from '../src/shared/models/daily-activity';
import { User } from '../src/shared/models/user';
import type { NaverAccount } from '../src/shared/lib/account-manager';
import type { CommentJobData } from '../src/shared/lib/queue/types';

type TargetCafeName = '샤넬오픈런' | '쇼핑지름신';

interface TargetPair {
  accountId: string;
  cafeName: TargetCafeName;
}

interface AccountRow {
  accountId: string;
  password: string;
  nickname?: string;
}

interface CafeRow {
  name: TargetCafeName;
  cafeId: string;
  cafeUrl: string;
  menuId: string;
  commentableMenuIds?: number[];
}

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;
const COMMENTS_PER_PAIR = Number(process.env.COMMENTS_PER_PAIR || 20);
const WINDOW_MIN = Number(process.env.WINDOW_MIN || 105);
const START_DELAY_MIN = Number(process.env.START_DELAY_MIN || 1);
const DRY_RUN = process.env.DRY_RUN === '1';
const TARGET_ARTICLES_PER_CAFE = 220;
const PER_PAGE = 20;
const MAX_BROWSE_PAGES = 30;

const TARGET_PAIRS: TargetPair[] = [
  { accountId: 'mh8j62wm', cafeName: '샤넬오픈런' },
  { accountId: 'mh8j62wm', cafeName: '쇼핑지름신' },
  { accountId: 'nes1p2kx', cafeName: '샤넬오픈런' },
  { accountId: 'nes1p2kx', cafeName: '쇼핑지름신' },
  { accountId: 'tinyfish183', cafeName: '샤넬오픈런' },
];

const FALLBACK_MENU_IDS: Record<TargetCafeName, Set<number>> = {
  샤넬오픈런: new Set([60, 42, 95, 112, 72, 99, 136, 84, 34, 70, 148, 85, 86, 125, 87, 52]),
  쇼핑지름신: new Set([847, 919, 153, 948, 278, 949, 337, 165, 715, 63, 251, 186, 751, 588]),
};

const FALLBACK_COMMENTS = [
  '좋은 정보 감사합니다 참고해볼게요',
  '정리해주신 내용 덕분에 도움 됐어요',
  '저도 궁금했던 부분이라 잘 읽었습니다',
  '경험 공유해주셔서 감사합니다',
  '읽어보니 참고할 만한 내용이 많네요',
  '저도 한번 더 알아봐야겠어요',
  '비슷한 고민 중이었는데 도움 됐습니다',
  '핵심만 잘 정리돼서 보기 편했어요',
  '공감하면서 읽었습니다 감사합니다',
  '이런 후기 찾아보고 있었는데 잘 봤어요',
];

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();

const toNaverAccount = (account: AccountRow): NaverAccount => ({
  id: account.accountId,
  password: account.password,
  nickname: account.nickname,
});

const getTodayKey = (): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const buildDelayPlan = (pairs: TargetPair[]): Map<string, number[]> => {
  const jobsByAccount = new Map<string, number>();

  for (const pair of pairs) {
    jobsByAccount.set(pair.accountId, (jobsByAccount.get(pair.accountId) || 0) + 1);
  }

  const delayByAccount = new Map<string, number[]>();

  for (const [accountId, count] of jobsByAccount) {
    if (count === 0) {
      delayByAccount.set(accountId, []);
      continue;
    }

    const startMs = START_DELAY_MIN * 60 * 1000;
    const windowMs = WINDOW_MIN * 60 * 1000;
    const gapMs = count <= 1 ? 0 : Math.floor((windowMs - startMs) / count);
    const delays = Array.from({ length: count }, (_, index) => {
      const waveJitterMs = Math.floor((index % 3) * 45 * 1000);
      return startMs + index * gapMs + waveJitterMs;
    });

    delayByAccount.set(accountId, delays);
  }

  return delayByAccount;
};

const getNextDelay = (delayPlan: Map<string, number[]>, accountId: string): number => {
  const delays = delayPlan.get(accountId) || [];
  const next = delays.shift();
  if (next === undefined) {
    return WINDOW_MIN * 60 * 1000;
  }
  return next;
};

const getPendingCommentCounts = async (
  cafes: Map<TargetCafeName, CafeRow>,
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  const accountIds = [...new Set(TARGET_PAIRS.map(({ accountId }) => accountId))];
  const targetCafeIds = new Set([...cafes.values()].map(({ cafeId }) => cafeId));

  for (const accountId of accountIds) {
    const queue = getTaskQueue(accountId);
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active'], 0, 200);

    for (const job of jobs) {
      const data = job.data;
      if (data.type !== 'comment' || !targetCafeIds.has(data.cafeId)) {
        continue;
      }

      const key = `${data.accountId}:${data.cafeId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return counts;
};

const getAttemptedArticleKeys = async (
  cafes: Map<TargetCafeName, CafeRow>,
): Promise<Set<string>> => {
  const attempted = new Set<string>();
  const accountIds = [...new Set(TARGET_PAIRS.map(({ accountId }) => accountId))];
  const targetCafeIds = new Set([...cafes.values()].map(({ cafeId }) => cafeId));

  for (const accountId of accountIds) {
    const queue = getTaskQueue(accountId);
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 500);

    for (const job of jobs) {
      const data = job.data;
      if (data.type !== 'comment' || !targetCafeIds.has(data.cafeId)) {
        continue;
      }

      attempted.add(`${data.cafeId}:${data.articleId}`);
    }
  }

  return attempted;
};

const getRemainingJobs = async (
  cafes: Map<TargetCafeName, CafeRow>,
): Promise<TargetPair[]> => {
  const today = getTodayKey();
  const cafeIds = [...cafes.values()].map(({ cafeId }) => cafeId);
  const accountIds = [...new Set(TARGET_PAIRS.map(({ accountId }) => accountId))];
  const [activities, pendingCounts] = await Promise.all([
    DailyActivity.find({
      accountId: { $in: accountIds },
      cafeId: { $in: cafeIds },
      date: today,
    }).lean(),
    getPendingCommentCounts(cafes),
  ]);
  const activityByKey = new Map(
    activities.map((activity) => [`${activity.accountId}:${activity.cafeId}`, activity.comments])
  );

  return TARGET_PAIRS.flatMap((pair) => {
    const cafe = cafes.get(pair.cafeName);
    if (!cafe) return [];

    const key = `${pair.accountId}:${cafe.cafeId}`;
    const currentComments = activityByKey.get(key) || 0;
    const pendingComments = pendingCounts.get(key) || 0;
    const remaining = Math.max(0, COMMENTS_PER_PAIR - currentComments - pendingComments);
    return Array.from({ length: remaining }, () => pair);
  });
};

const collectCafeArticles = async (
  account: NaverAccount,
  cafe: CafeRow,
): Promise<CafeArticle[]> => {
  const allowedMenuIds = cafe.commentableMenuIds?.length
    ? new Set(cafe.commentableMenuIds)
    : FALLBACK_MENU_IDS[cafe.name];
  const articles: CafeArticle[] = [];
  const seenArticleIds = new Set<number>();

  for (let page = 1; articles.length < TARGET_ARTICLES_PER_CAFE && page <= MAX_BROWSE_PAGES; page += 1) {
    const result = await browseCafePosts(account, cafe.cafeId, undefined, {
      page,
      perPage: PER_PAGE,
      cafeUrl: cafe.cafeUrl,
    });

    if (!result.success || result.articles.length === 0) {
      console.log(`[BROWSE] ${cafe.name} page=${page} stop: ${result.error || 'no articles'}`);
      break;
    }

    const filtered = result.articles.filter(({ articleId, menuId }) => {
      return allowedMenuIds.has(menuId) && !seenArticleIds.has(articleId);
    });

    for (const article of filtered) {
      seenArticleIds.add(article.articleId);
      articles.push(article);
    }

    console.log(`[BROWSE] ${cafe.name} page=${page} raw=${result.articles.length} added=${filtered.length} total=${articles.length}`);

    if (result.articles.length < PER_PAGE) {
      break;
    }

    await sleep(500);
  }

  return shuffle(articles);
};

const buildFallbackComment = (seed: number, subject?: string): string => {
  const fallback = FALLBACK_COMMENTS[seed % FALLBACK_COMMENTS.length];
  const normalizedSubject = compact(subject || '').replace(/[^\p{L}\p{N}\s]/gu, '').slice(0, 18);

  if (!normalizedSubject) {
    return fallback;
  }

  return `${fallback} ${normalizedSubject} 부분도 참고해볼게요`;
};

const buildComment = async (
  account: NaverAccount,
  cafeId: string,
  article: CafeArticle,
  seed: number,
): Promise<string> => {
  const fallback = buildFallbackComment(seed, article.subject);

  try {
    const content = await readCafeArticleContent(account, cafeId, article.articleId);
    if (!content.success || !content.content) {
      return fallback;
    }

    const context = compact(`${content.title || article.subject}\n\n${content.content}`);
    if (!context) {
      return fallback;
    }

    const generated = await generateComment(
      `${context}\n\n[지시] 존댓말로 짧고 자연스럽게 1문장만 작성. 과한 칭찬, 광고 문구, 이모지 금지.`,
      null,
      content.authorNickname,
    );

    return compact(generated) || fallback;
  } catch {
    return fallback;
  }
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const accountIds = [...new Set(TARGET_PAIRS.map(({ accountId }) => accountId))];
  const cafeNames = [...new Set(TARGET_PAIRS.map(({ cafeName }) => cafeName))];

  const [accounts, cafeRows] = await Promise.all([
    Account.find({
      userId: user.userId,
      accountId: { $in: accountIds },
      isActive: true,
    })
      .select('accountId password nickname')
      .lean<AccountRow[]>(),
    Cafe.find({
      userId: user.userId,
      name: { $in: cafeNames },
      isActive: true,
    })
      .select('name cafeId cafeUrl menuId commentableMenuIds')
      .lean<CafeRow[]>(),
  ]);

  const accountsById = new Map(accounts.map((account) => [account.accountId, account]));
  const cafesByName = new Map(cafeRows.map((cafe) => [cafe.name, cafe]));
  const missingAccounts = accountIds.filter((accountId) => !accountsById.has(accountId));
  const missingCafes = cafeNames.filter((cafeName) => !cafesByName.has(cafeName));

  if (missingAccounts.length > 0 || missingCafes.length > 0) {
    throw new Error(`missing accounts=${missingAccounts.join(',') || '-'} cafes=${missingCafes.join(',') || '-'}`);
  }

  const remainingJobs = await getRemainingJobs(cafesByName);
  const delayPlan = buildDelayPlan(remainingJobs);

  console.log('[PLAN]');
  console.log(`loginId=${LOGIN_ID}`);
  console.log(`targetPairs=${TARGET_PAIRS.length}`);
  console.log(`commentsPerPair=${COMMENTS_PER_PAIR}`);
  console.log(`remainingJobs=${remainingJobs.length}`);
  console.log(`windowMin=${WINDOW_MIN}`);
  console.log(`dryRun=${DRY_RUN ? 'yes' : 'no'}`);

  if (remainingJobs.length === 0) {
    console.log('[DONE] 오늘 목표 댓글 수 이미 충족');
    return;
  }

  const firstAccount = accountsById.get(remainingJobs[0].accountId);
  if (!firstAccount) {
    throw new Error(`first account not found: ${remainingJobs[0].accountId}`);
  }

  const articlePools = new Map<TargetCafeName, CafeArticle[]>();
  const naverFirstAccount = toNaverAccount(firstAccount);

  const remainingCafeNames = [...new Set(remainingJobs.map(({ cafeName }) => cafeName))];

  for (const cafeName of remainingCafeNames) {
    const cafe = cafesByName.get(cafeName);
    if (!cafe) {
      continue;
    }

    const articles = await collectCafeArticles(naverFirstAccount, cafe);
    if (articles.length === 0) {
      throw new Error(`no articles collected: ${cafeName}`);
    }
    articlePools.set(cafeName, articles);
    console.log(`[POOL] ${cafeName} articles=${articles.length}`);
  }

  const usedArticleKeys = await getAttemptedArticleKeys(cafesByName);
  let scheduled = 0;
  let maxScheduledDelay = 0;
  const countByAccount = new Map<string, number>();
  const countByCafe = new Map<string, number>();

  for (const [index, pair] of remainingJobs.entries()) {
    const account = accountsById.get(pair.accountId);
    const cafe = cafesByName.get(pair.cafeName);
    const pool = articlePools.get(pair.cafeName);

    if (!account || !cafe || !pool) {
      continue;
    }

    const target = pool.find((article) => {
      const articleKey = `${cafe.cafeId}:${article.articleId}`;
      if (usedArticleKeys.has(articleKey)) return false;
      if (account.nickname && article.nickname === account.nickname) return false;
      return true;
    });

    if (!target) {
      console.log(`[SKIP] ${pair.accountId}/${pair.cafeName}: target article missing`);
      continue;
    }

    usedArticleKeys.add(`${cafe.cafeId}:${target.articleId}`);

    const naverAccount = toNaverAccount(account);
    const content = await buildComment(naverAccount, cafe.cafeId, target, index);
    const delay = getNextDelay(delayPlan, account.accountId);
    maxScheduledDelay = Math.max(maxScheduledDelay, delay);
    const jobData: CommentJobData = {
      type: 'comment',
      accountId: account.accountId,
      cafeId: cafe.cafeId,
      articleId: target.articleId,
      content,
      userId: user.userId,
    };

    if (!DRY_RUN) {
      await addTaskJob(account.accountId, jobData, delay);
    }

    scheduled += 1;
    countByAccount.set(account.accountId, (countByAccount.get(account.accountId) || 0) + 1);
    countByCafe.set(pair.cafeName, (countByCafe.get(pair.cafeName) || 0) + 1);

    const etaMin = Math.round(delay / 60000);
    console.log(
      `[QUEUE] ${DRY_RUN ? 'dry ' : ''}${account.accountId} -> ${pair.cafeName} #${target.articleId} eta=${etaMin}m ${target.subject.slice(0, 28)}`
    );
  }

  console.log('[SUMMARY]');
  console.log(`scheduled=${scheduled}`);
  console.log(`byAccount=${JSON.stringify(Object.fromEntries(countByAccount))}`);
  console.log(`byCafe=${JSON.stringify(Object.fromEntries(countByCafe))}`);
  console.log(`lastEtaMin=${Math.round(maxScheduledDelay / 60000)}`);
};

main()
  .then(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[SCHEDULE_WRITER_LEVELUP_COMMENTS]', message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
