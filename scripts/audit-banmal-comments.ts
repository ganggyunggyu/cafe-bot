import dotenv from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { PublishedArticle } from '../src/shared/models/published-article';

dotenv.config({ path: '.env.local' });
dotenv.config();

type CommentType = 'comment' | 'reply';

interface ArticleComment {
  accountId: string;
  nickname?: string;
  content: string;
  type: CommentType;
  parentIndex?: number;
  commentId?: string;
  commentIndex?: number;
  sequenceId?: string;
  createdAt?: Date;
}

interface ArticleRecord {
  articleId: number;
  cafeId: string;
  keyword?: string;
  title?: string;
  articleUrl?: string;
  writerAccountId?: string;
  publishedAt: Date;
  comments?: ArticleComment[];
}

interface BanmalMatch {
  severity: 'confirmed' | 'review';
  articleId: number;
  cafeId: string;
  articleUrl: string;
  keyword: string;
  title: string;
  publishedAtKst: string;
  writerAccountId: string;
  accountId: string;
  nickname: string;
  type: CommentType;
  commentId: string;
  commentIndex: string;
  parentIndex: string;
  createdAtKst: string;
  content: string;
  suggestedContent: string;
  reasons: string[];
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_DAYS = 14;

const confirmedEndingPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:했어|됐어|있어|없어|같아|맞아|좋아|괜찮아|아니야|몰라|하자|가자|해봐|먹어봐|써봐|사봐)[~.!?ㅋㅎ\s]*$/u, reason: '반말 종결어미' },
  { pattern: /(?:뭐야|어디야|왜그래|왜 그래|그랬어|봤어|먹었어|샀어|썼어|해봤어)[~.!?ㅋㅎ\s]*$/u, reason: '반말 질문/응답형' },
  { pattern: /(?:문제야|뭐야|어디야|누구야|이거야|그거야|저거야|아니야|아냐|했니|봤니|먹었니|샀니|썼니|하냐|했냐|봤냐|먹었냐|샀냐|썼냐)[~.!?ㅋㅎ\s]*$/u, reason: '반말 의문/호격형 종결' },
];

const reviewInlinePatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|[\s"'“‘])(?:뭐야|아니야|맞아|좋아|괜찮아|몰라|했어|됐어|하자|가자|해봐)(?=$|[\s"'”’.,!?~ㅋㅎ])/u, reason: '문장 중 반말 표현' },
  { pattern: /(?:같아|있어|없어)(?=\s+(?:걱정|보이|보여|보일|싶|서|가지|드리|하|되|받|먹|느끼|망설))/u, reason: '반말형 연결 표현 검토' },
];

const politeEndingPattern = /(?:요|습니다|습니까|세요|네요|까요|나요|에요|예요|군요|더라고요|더라구요|거든요|잖아요|라구요|듯해요|같아요|봐요|해요|돼요|있어요|없어요|좋아요|맞아요|괜찮아요|아니에요|모르겠어요)[~.!?ㅋㅎ\s]*$/u;

const replacementPairs: Array<[RegExp, string]> = [
  [/했어([~.!?ㅋㅎ\s]*)$/u, '했어요$1'],
  [/됐어([~.!?ㅋㅎ\s]*)$/u, '됐어요$1'],
  [/있어([~.!?ㅋㅎ\s]*)$/u, '있어요$1'],
  [/없어([~.!?ㅋㅎ\s]*)$/u, '없어요$1'],
  [/같아([~.!?ㅋㅎ\s]*)$/u, '같아요$1'],
  [/맞아([~.!?ㅋㅎ\s]*)$/u, '맞아요$1'],
  [/좋아([~.!?ㅋㅎ\s]*)$/u, '좋아요$1'],
  [/괜찮아([~.!?ㅋㅎ\s]*)$/u, '괜찮아요$1'],
  [/아니야([~.!?ㅋㅎ\s]*)$/u, '아니에요$1'],
  [/몰라([~.!?ㅋㅎ\s]*)$/u, '모르겠어요$1'],
  [/하자([~.!?ㅋㅎ\s]*)$/u, '해보면 좋겠어요$1'],
  [/가자([~.!?ㅋㅎ\s]*)$/u, '가보면 좋겠어요$1'],
  [/해봐([~.!?ㅋㅎ\s]*)$/u, '해보세요$1'],
  [/먹어봐([~.!?ㅋㅎ\s]*)$/u, '먹어보세요$1'],
  [/써봐([~.!?ㅋㅎ\s]*)$/u, '써보세요$1'],
  [/사봐([~.!?ㅋㅎ\s]*)$/u, '사보세요$1'],
];

const getArgValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const toKstDateKey = (date: Date): string => {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
};

const formatKst = (date?: Date): string => {
  if (!date) return '';
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19);
};

const parseKstStart = (dateKey: string): Date => {
  return new Date(`${dateKey}T00:00:00+09:00`);
};

const parseKstNextDay = (dateKey: string): Date => {
  const start = parseKstStart(dateKey);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
};

const getDefaultDateRange = (): { start: Date; end: Date } => {
  const now = new Date();
  const todayKstKey = toKstDateKey(now);
  const todayStart = parseKstStart(todayKstKey);
  const start = new Date(todayStart.getTime() - (DEFAULT_DAYS - 1) * 24 * 60 * 60 * 1000);
  const end = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

const getDateRange = (): { start: Date; end: Date } => {
  const startArg = getArgValue('--start');
  const endArg = getArgValue('--end');

  if (startArg || endArg) {
    const { start, end } = getDefaultDateRange();
    return {
      start: startArg ? parseKstStart(startArg) : start,
      end: endArg ? parseKstNextDay(endArg) : end,
    };
  }

  const daysArg = Number(getArgValue('--days') ?? DEFAULT_DAYS);
  if (!Number.isFinite(daysArg) || daysArg < 1) return getDefaultDateRange();

  const now = new Date();
  const todayStart = parseKstStart(toKstDateKey(now));
  return {
    start: new Date(todayStart.getTime() - (daysArg - 1) * 24 * 60 * 60 * 1000),
    end: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000),
  };
};

const splitSentences = (content: string): string[] => {
  return content
    .split(/(?<=[.!?。！？~])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const detectBanmal = (content: string): { reasons: string[]; severity: 'confirmed' | 'review' } => {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return { reasons: [], severity: 'review' };

  const confirmedReasons = new Set<string>();
  const reviewReasons = new Set<string>();
  const sentences = splitSentences(normalized);
  const targets = sentences.length ? sentences : [normalized];

  for (const sentence of targets) {
    if (politeEndingPattern.test(sentence)) continue;

    for (const { pattern, reason } of confirmedEndingPatterns) {
      if (pattern.test(sentence)) confirmedReasons.add(reason);
    }
  }

  for (const { pattern, reason } of reviewInlinePatterns) {
    if (pattern.test(normalized)) reviewReasons.add(reason);
  }

  const reasons = [...confirmedReasons, ...reviewReasons];
  return {
    reasons,
    severity: confirmedReasons.size > 0 ? 'confirmed' : 'review',
  };
};

const suggestPoliteContent = (content: string): string => {
  return replacementPairs.reduce((current, [pattern, replacement]) => {
    return current.replace(pattern, replacement);
  }, content);
};

const csvEscape = (value: string): string => {
  return `"${value.replace(/"/g, '""')}"`;
};

const toCsv = (rows: BanmalMatch[]): string => {
  const headers = [
    'publishedAtKst',
    'severity',
    'cafeId',
    'articleId',
    'articleUrl',
    'keyword',
    'title',
    'writerAccountId',
    'accountId',
    'nickname',
    'type',
    'commentId',
    'commentIndex',
    'parentIndex',
    'createdAtKst',
    'content',
    'suggestedContent',
    'reasons',
  ];

  const body = rows.map((row) => {
    return headers.map((header) => csvEscape(String(row[header as keyof BanmalMatch] ?? ''))).join(',');
  });

  return [headers.join(','), ...body].join('\n');
};

const main = async (): Promise<void> => {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    throw new Error('MONGODB_URI가 필요합니다. .env.local 또는 환경변수를 확인해주세요.');
  }

  const { start, end } = getDateRange();
  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 10000 });

  const articles = await PublishedArticle.find({
    publishedAt: { $gte: start, $lt: end },
    'comments.0': { $exists: true },
  })
    .sort({ publishedAt: 1, articleId: 1 })
    .lean<ArticleRecord[]>();

  const matches: BanmalMatch[] = [];
  for (const article of articles) {
    for (const comment of article.comments ?? []) {
      const { reasons, severity } = detectBanmal(comment.content);
      if (!reasons.length) continue;

      matches.push({
        severity,
        articleId: article.articleId,
        cafeId: article.cafeId,
        articleUrl: article.articleUrl ?? `https://cafe.naver.com/ca-fe/cafes/${article.cafeId}/articles/${article.articleId}`,
        keyword: article.keyword ?? '',
        title: article.title ?? '',
        publishedAtKst: formatKst(article.publishedAt),
        writerAccountId: article.writerAccountId ?? '',
        accountId: comment.accountId,
        nickname: comment.nickname ?? '',
        type: comment.type,
        commentId: comment.commentId ?? '',
        commentIndex: comment.commentIndex === undefined ? '' : String(comment.commentIndex),
        parentIndex: comment.parentIndex === undefined ? '' : String(comment.parentIndex),
        createdAtKst: formatKst(comment.createdAt),
        content: comment.content,
        suggestedContent: suggestPoliteContent(comment.content),
        reasons,
      });
    }
  }

  const timestamp = formatKst(new Date()).replace(/[-: ]/g, '').slice(0, 12);
  const reportDir = path.join(process.cwd(), 'reports');
  await mkdir(reportDir, { recursive: true });

  const baseName = `cafe-banmal-comments-${toKstDateKey(start)}_${toKstDateKey(new Date(end.getTime() - 1))}-${timestamp}`;
  const jsonPath = path.join(reportDir, `${baseName}.json`);
  const csvPath = path.join(reportDir, `${baseName}.csv`);

  await writeFile(jsonPath, JSON.stringify({ rangeKst: { start: formatKst(start), endExclusive: formatKst(end) }, totalArticles: articles.length, totalMatches: matches.length, matches }, null, 2));
  await writeFile(csvPath, toCsv(matches));

  const byAccount = matches.reduce<Record<string, number>>((acc, match) => {
    acc[match.accountId] = (acc[match.accountId] ?? 0) + 1;
    return acc;
  }, {});

  const bySeverity = matches.reduce<Record<string, number>>((acc, match) => {
    acc[match.severity] = (acc[match.severity] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`기간(KST): ${formatKst(start)} ~ ${formatKst(end)} 미만`);
  console.log(`댓글 있는 발행글: ${articles.length}건`);
  console.log(`반말 후보 댓글: ${matches.length}건`);
  console.log(`확정/검토: confirmed ${bySeverity.confirmed ?? 0}, review ${bySeverity.review ?? 0}`);
  console.log(`계정별 후보: ${Object.entries(byAccount).map(([accountId, count]) => `${accountId} ${count}`).join(', ') || '없음'}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);

  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
