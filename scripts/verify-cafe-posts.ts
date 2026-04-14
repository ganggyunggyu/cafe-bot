import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

dotenv.config({ path: '.env.local' });

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_COMMENT_WARN_THRESHOLD = 3;
const DEFAULT_SAMPLE_LIMIT = 8;
const DEFAULT_INFERENCE_WINDOW_DAYS = 14;
const BRAND_NAME = '한려담원';
const DEFAULT_TARGET_NOTE = '기본 운영 목표치';
const DEFAULT_CAFE_TARGETS: Record<string, { today: number; yesterday: number }> = {
  '25729954': { today: 15, yesterday: 15 }, // 쇼핑지름신
  '25460974': { today: 10, yesterday: 10 }, // 샤넬오픈런
  '25636798': { today: 12, yesterday: 12 }, // 건강한노후준비
  '25227349': { today: 12, yesterday: 12 }, // 건강관리소
};

const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;
const PROMPT_TAG_PATTERN = /\[(댓글|작성자|댓글러|제3자|본문|제목)/;
const MARKDOWN_PATTERN = /(\*\*|`|^#|---|===)/m;
const EMPATHY_PATTERN = /(공감|힘드셨|힘내세요|응원|고생 많으|위로)/;
const STARTER_PATTERN = /^(저도|저는)/;
const POLITE_WARNING_PATTERN = /(했어|같아|먹었지|그랬어|몰라|좋네)([.!?~\s]|$)/;
const HELP_TEXT = `
카페 글/댓글 검증 리포트

사용법
  npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts [옵션]

옵션
  --cafe <token>                  cafeId, 카페명, cafeUrl 일부 문자열로 필터
  --date <YYYY-MM-DD>             기준일(KST). 기본값: 오늘
  --today-target <number>         금일 목표치
  --yesterday-target <number>     전일 목표치
  --cafe-target <token:today[:yesterday]>
                                  카페별 목표치 override
  --default-targets               기본 운영 목표치 프리셋 사용
  --comment-warn-threshold <n>    non-daily-ad 글의 최소 댓글/답글 합계 경고 기준. 기본 3
  --sample-limit <n>              날짜별 상세 문제 글 출력 개수. 기본 8
  --summary-only                  목표치 달성 여부만 간단히 출력
  --json                          JSON 출력
  --help                          도움말

예시
  npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts \\
    --cafe 25729954 \\
    --today-target 15 \\
    --yesterday-target 15

  npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts \\
    --cafe 쇼핑지름신 \\
    --cafe 샤넬오픈런 \\
    --cafe-target 쇼핑지름신:15:15 \\
    --cafe-target 샤넬오픈런:10:10

  npx tsx --env-file=.env.local scripts/verify-cafe-posts.ts \\
    --cafe 쇼핑지름신 \\
    --cafe 샤넬오픈런 \\
    --cafe 건강한노후준비 \\
    --cafe 건강관리소 \\
    --default-targets \\
    --summary-only

비고
  --default-targets를 주면 기본 운영 카페 목표치(쇼핑15 / 샤넬10 / 건강노후12 / 건강관리12)를 자동 적용합니다.
  단일 카페만 선택했고 목표치를 안 주면, 최근 글쓴 writer들의 dailyPostLimit 합으로 추정 목표치를 잡습니다.
  최종 판정은 리포트에서 이상으로 잡힌 글을 네이버 UI에서 한 번 더 확인하는 흐름을 권장합니다.
`.trim();

const PROHIBITED_PATTERNS = [
  {
    code: 'sales_phrase',
    severity: 'warn',
    label: '광고성 문구',
    regex: /(강추|꼭\s?드세요|무조건|대박|최고|완전(?!히)|추천해요|사세요|찾아보세요|알아보세요)/,
  },
  {
    code: 'hyperbole',
    severity: 'warn',
    label: '과장 표현',
    regex: /(완전히 달라졌|인생이 바뀌었)/,
  },
  {
    code: 'medical_claim',
    severity: 'warn',
    label: '의료 효능 단정',
    regex: /(치료|개선됐|낫더라|효과가?\s?(있|좋)|에 좋아요)/,
  },
  {
    code: 'contact_or_link',
    severity: 'error',
    label: '링크/문의 유도',
    regex: /(https?:\/\/|www\.|오픈채팅|카톡|DM|문의주세요|연락주세요)/i,
  },
];

export type CommentType = 'comment' | 'reply';
export type IssueSeverity = 'error' | 'warn';
export type TargetSource = 'explicit' | 'inferred' | 'preset';
export type TargetStatus = 'pass' | 'fail' | 'unknown';

export interface ArticleCommentRecord {
  accountId: string;
  nickname?: string;
  content: string;
  type: CommentType;
  createdAt?: Date | string;
  parentIndex?: number;
  commentId?: string;
  commentIndex?: number;
}

export interface ArticleRecord {
  cafeId: string;
  cafeName?: string;
  articleId: number;
  keyword?: string;
  title?: string;
  writerAccountId?: string;
  postType?: 'ad' | 'daily' | 'daily-ad';
  commentCount?: number;
  replyCount?: number;
  comments: ArticleCommentRecord[];
  articleUrl?: string;
  publishedAt?: Date | string;
  createdAt?: Date | string;
}

export interface TargetInfo {
  value: number;
  source: TargetSource;
  note?: string;
}

export interface VerificationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  articleId: number;
  accountId?: string;
  preview?: string;
}

export interface ArticleVerification {
  articleId: number;
  articleUrl: string;
  title: string;
  writerAccountId: string;
  publishedAt: string;
  postType: string;
  actualCommentCount: number;
  actualReplyCount: number;
  recordedCommentCount: number;
  recordedReplyCount: number;
  issues: VerificationIssue[];
}

export interface DaySummary {
  dateKey: string;
  actualPosts: number;
  target: TargetInfo | null;
  targetStatus: TargetStatus;
  diffFromTarget: number | null;
  writerBreakdown: Array<{ accountId: string; posts: number }>;
  problemArticleCount: number;
  totalIssueCount: number;
  articles: ArticleVerification[];
}

export interface CafeVerificationReport {
  cafeId: string;
  cafeName: string;
  yesterday: DaySummary;
  today: DaySummary;
}

export interface VerificationReport {
  generatedAt: string;
  baseDateKey: string;
  previousDateKey: string;
  cafes: CafeVerificationReport[];
}

export interface WriterLimitRecord {
  accountId: string;
  dailyPostLimit?: number;
}

interface CafeDescriptor {
  cafeId: string;
  name: string;
  cafeUrl?: string;
}

interface CafeTargetRule {
  token: string;
  today: number;
  yesterday: number;
}

export interface VerifyArgs {
  cafes: string[];
  baseDateKey: string;
  todayTarget?: number;
  yesterdayTarget?: number;
  cafeTargets: CafeTargetRule[];
  defaultTargets: boolean;
  commentWarnThreshold: number;
  sampleLimit: number;
  summaryOnly: boolean;
  json: boolean;
  help: boolean;
}

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const normalizeCommentContent = (value: string): string => normalizeWhitespace(value).toLowerCase();

const buildPreview = (value: string, maxLength: number = 48): string => {
  const normalized = normalizeWhitespace(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const asDate = (value?: Date | string | null): Date | null => {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toKstDateKey = (value?: Date | string | null): string => {
  const date = asDate(value);
  if (!date) return '';

  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
};

export const getTodayKstDateKey = (): string => toKstDateKey(new Date());

export const shiftKstDateKey = (dateKey: string, amount: number): string => {
  const baseDate = new Date(`${dateKey}T00:00:00+09:00`);
  return toKstDateKey(new Date(baseDate.getTime() + (amount * DAY_MS)));
};

const getKstDayRange = (dateKey: string): { start: Date; end: Date } => {
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
};

const parseInteger = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flag} 값이 숫자가 아닙니다: ${value}`);
  }

  return parsed;
};

const parseCafeTargetRule = (raw: string): CafeTargetRule => {
  const [token, todayRaw, yesterdayRaw] = raw.split(':');

  if (!token || !todayRaw) {
    throw new Error(`--cafe-target 형식이 잘못됐습니다: ${raw}`);
  }

  const today = parseInteger(todayRaw, '--cafe-target');
  const yesterday = yesterdayRaw ? parseInteger(yesterdayRaw, '--cafe-target') : today;

  return { token, today, yesterday };
};

export const parseVerifyArgs = (argv: string[]): VerifyArgs => {
  const args: VerifyArgs = {
    cafes: [],
    baseDateKey: getTodayKstDateKey(),
    cafeTargets: [],
    defaultTargets: false,
    commentWarnThreshold: DEFAULT_COMMENT_WARN_THRESHOLD,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    summaryOnly: false,
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

    if (token === '--json') {
      args.json = true;
      continue;
    }

    if (token === '--default-targets') {
      args.defaultTargets = true;
      continue;
    }

    if (token === '--summary-only') {
      args.summaryOnly = true;
      continue;
    }

    const value = tokens.shift();
    if (!value) {
      throw new Error(`${token} 값이 비었습니다`);
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

    if (token === '--today-target') {
      args.todayTarget = parseInteger(value, '--today-target');
      continue;
    }

    if (token === '--yesterday-target') {
      args.yesterdayTarget = parseInteger(value, '--yesterday-target');
      continue;
    }

    if (token === '--cafe-target') {
      args.cafeTargets.push(parseCafeTargetRule(value));
      continue;
    }

    if (token === '--comment-warn-threshold') {
      args.commentWarnThreshold = parseInteger(value, '--comment-warn-threshold');
      continue;
    }

    if (token === '--sample-limit') {
      args.sampleLimit = parseInteger(value, '--sample-limit');
      continue;
    }

    throw new Error(`알 수 없는 옵션입니다: ${token}`);
  }

  return args;
};

const matchesCafeToken = (cafe: CafeDescriptor, token: string): boolean => {
  const loweredToken = token.toLowerCase();
  return [
    cafe.cafeId,
    cafe.name,
    cafe.cafeUrl || '',
  ].some((value) => value.toLowerCase().includes(loweredToken));
};

const buildKnownCafes = (
  cafeDocs: Array<Record<string, unknown>>,
  articleDocs: Array<Record<string, unknown>>,
): CafeDescriptor[] => {
  const cafes = new Map<string, CafeDescriptor>();

  for (const rawCafe of cafeDocs) {
    const cafeId = String(rawCafe.cafeId || '');
    if (!cafeId) continue;

    cafes.set(cafeId, {
      cafeId,
      name: String(rawCafe.name || cafeId),
      cafeUrl: rawCafe.cafeUrl ? String(rawCafe.cafeUrl) : undefined,
    });
  }

  for (const rawArticle of articleDocs) {
    const cafeId = String(rawArticle.cafeId || '');
    if (!cafeId || cafes.has(cafeId)) continue;

    cafes.set(cafeId, {
      cafeId,
      name: cafeId,
    });
  }

  return [...cafes.values()].sort(({ name: left }, { name: right }) => left.localeCompare(right, 'ko'));
};

const selectCafes = (
  allCafes: CafeDescriptor[],
  requestedTokens: string[],
): CafeDescriptor[] => {
  if (requestedTokens.length === 0) {
    return allCafes;
  }

  const matched = new Map<string, CafeDescriptor>();

  for (const token of requestedTokens) {
    const cafes = allCafes.filter((cafe) => matchesCafeToken(cafe, token));

    if (cafes.length === 0) {
      const available = allCafes.map(({ name, cafeId }) => `${name}(${cafeId})`).join(', ');
      throw new Error(`카페를 찾지 못했습니다: ${token}\n사용 가능한 카페: ${available}`);
    }

    for (const cafe of cafes) {
      matched.set(cafe.cafeId, cafe);
    }
  }

  return [...matched.values()];
};

const mapRawComment = (raw: Record<string, unknown>): ArticleCommentRecord => ({
  accountId: String(raw.accountId || ''),
  nickname: raw.nickname ? String(raw.nickname) : undefined,
  content: String(raw.content || ''),
  type: raw.type === 'reply' ? 'reply' : 'comment',
  createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
  parentIndex: typeof raw.parentIndex === 'number' ? raw.parentIndex : undefined,
  commentId: raw.commentId ? String(raw.commentId) : undefined,
  commentIndex: typeof raw.commentIndex === 'number' ? raw.commentIndex : undefined,
});

const mapRawArticle = (
  raw: Record<string, unknown>,
  cafeMap: Map<string, CafeDescriptor>,
): ArticleRecord => {
  const cafeId = String(raw.cafeId || '');
  const articleId = Number(raw.articleId || 0);
  const comments = Array.isArray(raw.comments)
    ? raw.comments.map((comment) => mapRawComment(comment as Record<string, unknown>))
    : [];
  const fallbackUrl = cafeId && articleId
    ? `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`
    : '';
  const cafe = cafeMap.get(cafeId);

  return {
    cafeId,
    cafeName: cafe?.name,
    articleId,
    keyword: raw.keyword ? String(raw.keyword) : undefined,
    title: raw.title ? String(raw.title) : undefined,
    writerAccountId: raw.writerAccountId ? String(raw.writerAccountId) : undefined,
    postType: raw.postType === 'daily-ad' || raw.postType === 'ad' || raw.postType === 'daily'
      ? raw.postType
      : undefined,
    commentCount: typeof raw.commentCount === 'number' ? raw.commentCount : 0,
    replyCount: typeof raw.replyCount === 'number' ? raw.replyCount : 0,
    comments,
    articleUrl: raw.articleUrl ? String(raw.articleUrl) : fallbackUrl,
    publishedAt: raw.publishedAt ? String(raw.publishedAt) : raw.createdAt ? String(raw.createdAt) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
  };
};

const appendIssue = (issues: VerificationIssue[], nextIssue: VerificationIssue): void => {
  const alreadyExists = issues.some((issue) =>
    issue.code === nextIssue.code
    && issue.message === nextIssue.message
    && issue.preview === nextIssue.preview
    && issue.accountId === nextIssue.accountId,
  );

  if (!alreadyExists) {
    issues.push(nextIssue);
  }
};

const detectPerCommentIssues = (
  articleId: number,
  comment: ArticleCommentRecord,
): VerificationIssue[] => {
  const { accountId, content } = comment;
  const issues: VerificationIssue[] = [];
  const preview = buildPreview(content);

  if (PROMPT_TAG_PATTERN.test(content)) {
    issues.push({
      code: 'prompt_tag_leak',
      severity: 'error',
      message: '댓글에 원고 태그가 그대로 남아 있음',
      articleId,
      accountId,
      preview,
    });
  }

  if (MARKDOWN_PATTERN.test(content)) {
    issues.push({
      code: 'markdown_leak',
      severity: 'warn',
      message: '댓글에 마크다운/구분선 패턴이 섞여 있음',
      articleId,
      accountId,
      preview,
    });
  }

  if (EMOJI_PATTERN.test(content)) {
    issues.push({
      code: 'emoji_detected',
      severity: 'warn',
      message: '댓글에 이모지가 포함됨',
      articleId,
      accountId,
      preview,
    });
  }

  if (POLITE_WARNING_PATTERN.test(content)) {
    issues.push({
      code: 'banmal_suspected',
      severity: 'warn',
      message: '반말 가능성이 있는 어미가 보임',
      articleId,
      accountId,
      preview,
    });
  }

  for (const { code, label, regex, severity } of PROHIBITED_PATTERNS) {
    if (!regex.test(content)) continue;

    issues.push({
      code,
      severity,
      message: `${label} 패턴이 감지됨`,
      articleId,
      accountId,
      preview,
    });
  }

  return issues;
};

export const detectArticleIssues = (
  article: ArticleRecord,
  options: { commentWarnThreshold?: number } = {},
): VerificationIssue[] => {
  const { articleId, commentCount = 0, replyCount = 0, comments, postType } = article;
  const commentWarnThreshold = options.commentWarnThreshold ?? DEFAULT_COMMENT_WARN_THRESHOLD;
  const issues: VerificationIssue[] = [];
  const mainComments = comments.filter(({ type }) => type === 'comment');
  const replies = comments.filter(({ type }) => type === 'reply');

  if (mainComments.length !== commentCount) {
    appendIssue(issues, {
      code: 'comment_count_mismatch',
      severity: 'warn',
      message: `저장된 댓글 수(${commentCount})와 실제 댓글 수(${mainComments.length})가 다름`,
      articleId,
    });
  }

  if (replies.length !== replyCount) {
    appendIssue(issues, {
      code: 'reply_count_mismatch',
      severity: 'warn',
      message: `저장된 답글 수(${replyCount})와 실제 답글 수(${replies.length})가 다름`,
      articleId,
    });
  }

  if (postType !== 'daily-ad' && (mainComments.length + replies.length) < commentWarnThreshold) {
    appendIssue(issues, {
      code: 'low_comment_volume',
      severity: mainComments.length + replies.length === 0 ? 'error' : 'warn',
      message: `댓글/답글 합계가 기준(${commentWarnThreshold})보다 적음`,
      articleId,
    });
  }

  const duplicateMap = new Map<string, Array<{ accountId: string; preview: string }>>();
  for (const comment of comments) {
    const normalized = normalizeCommentContent(comment.content);
    if (!normalized) continue;

    const entries = duplicateMap.get(normalized) || [];
    entries.push({ accountId: comment.accountId, preview: buildPreview(comment.content) });
    duplicateMap.set(normalized, entries);

    for (const issue of detectPerCommentIssues(articleId, comment)) {
      appendIssue(issues, issue);
    }
  }

  for (const [normalized, entries] of duplicateMap.entries()) {
    if (entries.length < 2) continue;

    appendIssue(issues, {
      code: 'duplicate_comment_in_article',
      severity: 'error',
      message: `같은 댓글이 글 내부에서 ${entries.length}회 반복됨`,
      articleId,
      accountId: entries[0]?.accountId,
      preview: buildPreview(normalized),
    });
  }

  const mainCommentAccountCounts = new Map<string, number>();
  for (const { accountId } of mainComments) {
    mainCommentAccountCounts.set(accountId, (mainCommentAccountCounts.get(accountId) || 0) + 1);
  }

  for (const [accountId, count] of mainCommentAccountCounts.entries()) {
    if (count <= 1) continue;

    appendIssue(issues, {
      code: 'same_account_multiple_main_comments',
      severity: 'warn',
      message: `같은 계정이 메인 댓글을 ${count}개 남김`,
      articleId,
      accountId,
    });
  }

  const brandMentionCount = comments.reduce((count, { content }) => count + (content.includes(BRAND_NAME) ? 1 : 0), 0);
  if (brandMentionCount > 1) {
    appendIssue(issues, {
      code: 'brand_overuse',
      severity: 'warn',
      message: `${BRAND_NAME} 언급이 ${brandMentionCount}회로 많음`,
      articleId,
    });
  }

  const empathyCount = mainComments.reduce((count, { content }) => count + (EMPATHY_PATTERN.test(content) ? 1 : 0), 0);
  if (empathyCount > 2) {
    appendIssue(issues, {
      code: 'empathy_overuse',
      severity: 'warn',
      message: `공감/위로성 메인 댓글이 ${empathyCount}개로 많음`,
      articleId,
    });
  }

  const orderedMainComments = [...mainComments].sort((left, right) => {
    const leftTime = asDate(left.createdAt)?.getTime() || 0;
    const rightTime = asDate(right.createdAt)?.getTime() || 0;
    return leftTime - rightTime;
  });

  let consecutiveStarterStreak = 0;
  for (let index = 0; index < orderedMainComments.length; index += 1) {
    const current = orderedMainComments[index];
    const previous = orderedMainComments[index - 1];

    if (current && previous && STARTER_PATTERN.test(current.content) && STARTER_PATTERN.test(previous.content)) {
      consecutiveStarterStreak += 1;
    }
  }

  if (consecutiveStarterStreak > 0) {
    appendIssue(issues, {
      code: 'starter_repetition',
      severity: 'warn',
      message: '"저도/저는" 시작 댓글이 연속으로 배치됨',
      articleId,
    });
  }

  return issues.sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'error' ? -1 : 1;
    }

    return left.code.localeCompare(right.code);
  });
};

const createArticleVerification = (
  article: ArticleRecord,
  commentWarnThreshold: number,
): ArticleVerification => {
  const actualCommentCount = article.comments.filter(({ type }) => type === 'comment').length;
  const actualReplyCount = article.comments.filter(({ type }) => type === 'reply').length;

  return {
    articleId: article.articleId,
    articleUrl: article.articleUrl || `https://cafe.naver.com/ca-fe/cafes/${article.cafeId}/articles/${article.articleId}`,
    title: article.title || article.keyword || '(제목 없음)',
    writerAccountId: article.writerAccountId || '(writer 없음)',
    publishedAt: asDate(article.publishedAt || article.createdAt)?.toISOString() || '',
    postType: article.postType || 'unknown',
    actualCommentCount,
    actualReplyCount,
    recordedCommentCount: article.commentCount || 0,
    recordedReplyCount: article.replyCount || 0,
    issues: detectArticleIssues(article, { commentWarnThreshold }),
  };
};

const attachCrossArticleDuplicateIssues = (articles: ArticleVerification[], records: ArticleRecord[]): void => {
  const duplicateMap = new Map<string, Array<{ articleId: number; accountId: string; preview: string }>>();

  for (const article of records) {
    for (const comment of article.comments) {
      const normalized = normalizeCommentContent(comment.content);
      if (!normalized || normalized.length < 8) continue;

      const entries = duplicateMap.get(normalized) || [];
      entries.push({
        articleId: article.articleId,
        accountId: comment.accountId,
        preview: buildPreview(comment.content),
      });
      duplicateMap.set(normalized, entries);
    }
  }

  const articleMap = new Map(articles.map((article) => [article.articleId, article]));

  for (const entries of duplicateMap.values()) {
    const articleIds = [...new Set(entries.map(({ articleId }) => articleId))];
    if (articleIds.length < 2) continue;

    for (const articleId of articleIds) {
      const article = articleMap.get(articleId);
      if (!article) continue;

      const relatedArticleIds = articleIds.filter((id) => id !== articleId).slice(0, 3);
      appendIssue(article.issues, {
        code: 'cross_article_duplicate_comment',
        severity: 'warn',
        message: `같은 댓글이 다른 글에도 반복됨 (#${relatedArticleIds.join(', #')})`,
        articleId,
        preview: entries[0]?.preview,
      });
    }
  }

  for (const article of articles) {
    article.issues.sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === 'error' ? -1 : 1;
      }

      return left.code.localeCompare(right.code);
    });
  }
};

export const inferTargetFromWriterLimits = (
  recentWriterIds: string[],
  writerLimits: WriterLimitRecord[],
): TargetInfo | null => {
  const candidateIds = recentWriterIds.length > 0
    ? new Set(recentWriterIds)
    : new Set(writerLimits.map(({ accountId }) => accountId));
  const matchedWriters = writerLimits.filter(({ accountId, dailyPostLimit }) =>
    candidateIds.has(accountId) && typeof dailyPostLimit === 'number' && dailyPostLimit > 0,
  );

  if (matchedWriters.length === 0) {
    return null;
  }

  const value = matchedWriters.reduce((sum, { dailyPostLimit = 0 }) => sum + dailyPostLimit, 0);
  const note = `${matchedWriters.length}개 writer dailyPostLimit 합`;

  return { value, source: 'inferred', note };
};

export const getDefaultTargetForCafe = (
  cafe: Pick<CafeDescriptor, 'cafeId' | 'name'>,
  day: 'today' | 'yesterday' = 'today',
): TargetInfo | null => {
  const preset = DEFAULT_CAFE_TARGETS[cafe.cafeId];
  if (!preset) {
    return null;
  }

  return {
    value: preset[day],
    source: 'preset',
    note: DEFAULT_TARGET_NOTE,
  };
};

const buildWriterBreakdown = (articles: ArticleRecord[]): Array<{ accountId: string; posts: number }> => {
  const counts = new Map<string, number>();

  for (const { writerAccountId } of articles) {
    const accountId = writerAccountId || '(writer 없음)';
    counts.set(accountId, (counts.get(accountId) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([accountId, posts]) => ({ accountId, posts }))
    .sort((left, right) => right.posts - left.posts || left.accountId.localeCompare(right.accountId));
};

const resolveTargetForCafeDay = (
  cafe: CafeDescriptor,
  dateKey: string,
  todayDateKey: string,
  args: VerifyArgs,
  inferredTarget: TargetInfo | null,
): TargetInfo | null => {
  const matchedRule = args.cafeTargets.find(({ token }) => matchesCafeToken(cafe, token));
  if (matchedRule) {
    return {
      value: dateKey === todayDateKey ? matchedRule.today : matchedRule.yesterday,
      source: 'explicit',
    };
  }

  if (dateKey === todayDateKey && typeof args.todayTarget === 'number') {
    return { value: args.todayTarget, source: 'explicit' };
  }

  if (dateKey !== todayDateKey && typeof args.yesterdayTarget === 'number') {
    return { value: args.yesterdayTarget, source: 'explicit' };
  }

  if (args.defaultTargets) {
    const defaultTarget = getDefaultTargetForCafe(
      cafe,
      dateKey === todayDateKey ? 'today' : 'yesterday',
    );
    if (defaultTarget) {
      return defaultTarget;
    }
  }

  return inferredTarget;
};

export const buildDaySummary = (
  articles: ArticleRecord[],
  options: {
    dateKey: string;
    target?: TargetInfo | null;
    commentWarnThreshold?: number;
  },
): DaySummary => {
  const { dateKey, target = null } = options;
  const commentWarnThreshold = options.commentWarnThreshold ?? DEFAULT_COMMENT_WARN_THRESHOLD;
  const dayArticles = articles.filter((article) => toKstDateKey(article.publishedAt || article.createdAt) === dateKey);
  const articleReports = dayArticles.map((article) => createArticleVerification(article, commentWarnThreshold));

  attachCrossArticleDuplicateIssues(articleReports, dayArticles);

  articleReports.sort((left, right) => {
    if (left.issues.length !== right.issues.length) {
      return right.issues.length - left.issues.length;
    }

    return left.articleId - right.articleId;
  });

  const actualPosts = dayArticles.length;
  const diffFromTarget = target ? actualPosts - target.value : null;
  const targetStatus = target
    ? actualPosts >= target.value ? 'pass' : 'fail'
    : 'unknown';
  const totalIssueCount = articleReports.reduce((sum, { issues }) => sum + issues.length, 0);
  const problemArticleCount = articleReports.filter(({ issues }) => issues.length > 0).length;

  return {
    dateKey,
    actualPosts,
    target,
    targetStatus,
    diffFromTarget,
    writerBreakdown: buildWriterBreakdown(dayArticles),
    problemArticleCount,
    totalIssueCount,
    articles: articleReports,
  };
};

const formatTargetLine = ({ target, actualPosts, targetStatus, diffFromTarget }: DaySummary): string => {
  if (!target) {
    return `목표 미지정 | 실제 ${actualPosts}건`;
  }

  const statusLabel = targetStatus === 'pass' ? 'PASS' : 'FAIL';
  const diffLabel = diffFromTarget === 0
    ? '차이 0'
    : diffFromTarget && diffFromTarget > 0
      ? `+${diffFromTarget}`
      : `${diffFromTarget}`;
  const note = target.note ? ` (${target.note})` : '';

  return `${statusLabel} | 목표 ${target.value}건 / 실제 ${actualPosts}건 (${diffLabel}) [${target.source}]${note}`;
};

const formatWriterBreakdown = (writerBreakdown: Array<{ accountId: string; posts: number }>): string => {
  if (writerBreakdown.length === 0) {
    return '작성자 분포 없음';
  }

  return `작성자 분포: ${writerBreakdown.map(({ accountId, posts }) => `${accountId}(${posts})`).join(', ')}`;
};

const renderIssue = ({ severity, message, accountId, preview }: VerificationIssue): string => {
  const accountLabel = accountId ? ` [${accountId}]` : '';
  const previewLabel = preview ? ` "${preview}"` : '';
  return `    - ${severity.toUpperCase()}${accountLabel} ${message}${previewLabel}`;
};

const renderDaySummary = (summary: DaySummary, sampleLimit: number): string[] => {
  const lines = [
    `  [${summary.dateKey}]`,
    `  ${formatTargetLine(summary)}`,
    `  ${formatWriterBreakdown(summary.writerBreakdown)}`,
    `  문제 글 ${summary.problemArticleCount}건 / 총 이슈 ${summary.totalIssueCount}건`,
  ];

  const problemArticles = summary.articles.filter(({ issues }) => issues.length > 0).slice(0, sampleLimit);
  for (const article of problemArticles) {
    lines.push(
      `  - #${article.articleId} [${article.writerAccountId}] ${article.title}`,
      `    댓글 ${article.actualCommentCount}/${article.recordedCommentCount} | 답글 ${article.actualReplyCount}/${article.recordedReplyCount} | ${article.articleUrl}`,
    );

    for (const issue of article.issues.slice(0, 4)) {
      lines.push(renderIssue(issue));
    }

    if (article.issues.length > 4) {
      lines.push(`    - ... 외 ${article.issues.length - 4}건`);
    }
  }

  if (summary.problemArticleCount > sampleLimit) {
    lines.push(`  - ... 외 문제 글 ${summary.problemArticleCount - sampleLimit}건`);
  }

  return lines;
};

export const renderVerificationReport = (report: VerificationReport, sampleLimit: number = DEFAULT_SAMPLE_LIMIT): string => {
  const lines = [
    '=== 카페 글 검증 리포트 ===',
    `생성시각: ${report.generatedAt}`,
    `기준일: ${report.baseDateKey} | 전일: ${report.previousDateKey}`,
    '',
  ];

  for (const cafe of report.cafes) {
    lines.push(
      `## ${cafe.cafeName} (${cafe.cafeId})`,
      ...renderDaySummary(cafe.yesterday, sampleLimit),
      '',
      ...renderDaySummary(cafe.today, sampleLimit),
      '',
    );
  }

  return lines.join('\n').trim();
};

const formatGoalStatusLine = (label: string, summary: DaySummary): string => {
  if (!summary.target) {
    return `${label} ${summary.dateKey} | 목표 미지정 | 실제 ${summary.actualPosts}건`;
  }

  const statusLabel = summary.targetStatus === 'pass' ? 'PASS' : 'FAIL';
  const diffLabel = summary.diffFromTarget && summary.diffFromTarget !== 0
    ? ` (${summary.diffFromTarget > 0 ? `+${summary.diffFromTarget}` : summary.diffFromTarget})`
    : '';

  return `${label} ${summary.dateKey} | ${statusLabel} | 목표 ${summary.target.value}건 / 실제 ${summary.actualPosts}건${diffLabel}`;
};

export const renderGoalStatusReport = (report: VerificationReport): string => {
  const lines = [
    '=== 카페 목표치 점검 ===',
    `생성시각: ${report.generatedAt}`,
    `기준일: ${report.baseDateKey} | 전일: ${report.previousDateKey}`,
    '',
  ];

  for (const cafe of report.cafes) {
    lines.push(
      `- ${cafe.cafeName} (${cafe.cafeId})`,
      `  ${formatGoalStatusLine('전일', cafe.yesterday)}`,
      `  ${formatGoalStatusLine('금일', cafe.today)}`,
      '',
    );
  }

  return lines.join('\n').trim();
};

const buildCafeVerificationReport = (
  cafe: CafeDescriptor,
  articles: ArticleRecord[],
  args: VerifyArgs,
  inferredTarget: TargetInfo | null,
): CafeVerificationReport => {
  const todayDateKey = args.baseDateKey;
  const previousDateKey = shiftKstDateKey(todayDateKey, -1);

  return {
    cafeId: cafe.cafeId,
    cafeName: cafe.name,
    yesterday: buildDaySummary(articles, {
      dateKey: previousDateKey,
      target: resolveTargetForCafeDay(cafe, previousDateKey, todayDateKey, args, inferredTarget),
      commentWarnThreshold: args.commentWarnThreshold,
    }),
    today: buildDaySummary(articles, {
      dateKey: todayDateKey,
      target: resolveTargetForCafeDay(cafe, todayDateKey, todayDateKey, args, inferredTarget),
      commentWarnThreshold: args.commentWarnThreshold,
    }),
  };
};

const loadReport = async (args: VerifyArgs): Promise<VerificationReport> => {
  const { start: previousDayStart } = getKstDayRange(shiftKstDateKey(args.baseDateKey, -1));
  const { end: currentDayEnd } = getKstDayRange(args.baseDateKey);

  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
  });

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB database handle을 가져오지 못했습니다');
  }

  const [cafeDocs, articleDocs, writerDocs] = await Promise.all([
    db.collection('cafes').find({ isActive: true }).project({ _id: 0, cafeId: 1, name: 1, cafeUrl: 1 }).toArray(),
    db.collection('publishedarticles')
      .find({
        $or: [
          { publishedAt: { $gte: previousDayStart, $lt: currentDayEnd } },
          { createdAt: { $gte: previousDayStart, $lt: currentDayEnd } },
        ],
      })
      .project({
        _id: 0,
        cafeId: 1,
        articleId: 1,
        keyword: 1,
        title: 1,
        writerAccountId: 1,
        postType: 1,
        commentCount: 1,
        replyCount: 1,
        comments: 1,
        articleUrl: 1,
        publishedAt: 1,
        createdAt: 1,
      })
      .sort({ publishedAt: 1, createdAt: 1 })
      .toArray(),
    db.collection('accounts')
      .find({ isActive: true, role: 'writer' })
      .project({ _id: 0, accountId: 1, dailyPostLimit: 1 })
      .toArray(),
  ]);

  const knownCafes = buildKnownCafes(cafeDocs as Array<Record<string, unknown>>, articleDocs as Array<Record<string, unknown>>);
  const selectedCafes = selectCafes(knownCafes, args.cafes);
  const cafeMap = new Map(knownCafes.map((cafe) => [cafe.cafeId, cafe]));
  const selectedCafeIds = new Set(selectedCafes.map(({ cafeId }) => cafeId));
  const allArticles = (articleDocs as Array<Record<string, unknown>>)
    .map((rawArticle) => mapRawArticle(rawArticle, cafeMap))
    .filter(({ cafeId }) => selectedCafeIds.has(cafeId));
  const writerLimits = (writerDocs as Array<Record<string, unknown>>).map(({ accountId, dailyPostLimit }) => ({
    accountId: String(accountId || ''),
    dailyPostLimit: typeof dailyPostLimit === 'number' ? dailyPostLimit : undefined,
  }));

  let inferredTarget: TargetInfo | null = null;
  if (
    selectedCafes.length === 1
    && typeof args.todayTarget !== 'number'
    && typeof args.yesterdayTarget !== 'number'
    && args.cafeTargets.length === 0
  ) {
    const singleCafeId = selectedCafes[0]?.cafeId;
    const { start: recentStart } = getKstDayRange(shiftKstDateKey(args.baseDateKey, -(DEFAULT_INFERENCE_WINDOW_DAYS - 1)));
    const recentArticles = await db.collection('publishedarticles')
      .find({
        cafeId: singleCafeId,
        $or: [
          { publishedAt: { $gte: recentStart, $lt: currentDayEnd } },
          { createdAt: { $gte: recentStart, $lt: currentDayEnd } },
        ],
      })
      .project({ _id: 0, writerAccountId: 1 })
      .toArray();
    const recentWriterIds = recentArticles
      .map(({ writerAccountId }) => String(writerAccountId || ''))
      .filter(Boolean);

    inferredTarget = inferTargetFromWriterLimits(recentWriterIds, writerLimits);
  }

  const cafes = selectedCafes.map((cafe) => buildCafeVerificationReport(
    cafe,
    allArticles.filter(({ cafeId }) => cafeId === cafe.cafeId),
    args,
    inferredTarget,
  ));

  return {
    generatedAt: new Date().toISOString(),
    baseDateKey: args.baseDateKey,
    previousDateKey: shiftKstDateKey(args.baseDateKey, -1),
    cafes,
  };
};

const closeConnection = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

const isDirectExecution = (): boolean => {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryPoint).href;
};

const main = async (): Promise<void> => {
  const args = parseVerifyArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  try {
    const report = await loadReport(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (args.summaryOnly) {
      console.log(renderGoalStatusReport(report));
      return;
    }

    console.log(renderVerificationReport(report, args.sampleLimit));
  } finally {
    await closeConnection();
  }
};

if (isDirectExecution()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VERIFY-CAFE-POSTS] ${message}`);
    process.exit(1);
  });
}
