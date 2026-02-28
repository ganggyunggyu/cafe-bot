/**
 * Writer side activity runner
 * - Target loginId user's writer accounts only
 * - Per writer: 2 comments + 1 like on random posts
 *
 * Usage:
 * npx tsx --env-file=.env.local scripts/run-writer-side-activity.ts
 *
 * Optional env:
 * LOGIN_ID=21lab
 * COMMENTS_PER_WRITER=2
 * LIKES_PER_WRITER=1
 * PER_PAGE=40
 * ACTION_DELAY_MS=1500
 */

import mongoose from 'mongoose';
import { browseCafePosts, pickRandomArticles, type CafeArticle } from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { writeCommentWithAccount } from '../src/features/auto-comment/comment-writer';
import { likeArticleWithAccount } from '../src/features/auto-comment/like-writer';
import { generateComment } from '../src/shared/api/comment-gen-api';
import type { NaverAccount } from '../src/shared/lib/account-manager';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';

type WriterRunResult = {
  accountId: string;
  cafeName: string;
  commentsAttempted: number;
  commentsSucceeded: number;
  likesAttempted: number;
  likesSucceeded: number;
  errors: string[];
};

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const COMMENTS_PER_WRITER = Math.max(0, Number(process.env.COMMENTS_PER_WRITER || 2));
const LIKES_PER_WRITER = Math.max(0, Number(process.env.LIKES_PER_WRITER || 1));
const PER_PAGE = Math.max(5, Number(process.env.PER_PAGE || 40));
const ACTION_DELAY_MS = Math.max(0, Number(process.env.ACTION_DELAY_MS || 1500));
const TARGET_CAFE_ID = (process.env.TARGET_CAFE_ID || '').trim();
const TARGET_CAFE_NAME = (process.env.TARGET_CAFE_NAME || '').trim();
const MONGODB_URI = process.env.MONGODB_URI;

const COMMENT_TEMPLATES = [
  '좋은 정보 감사합니다. 참고해볼게요.',
  '저도 비슷하게 느꼈는데 정리 잘해주셨네요.',
  '경험 공유 감사합니다. 도움이 됐어요.',
  '내용이 깔끔해서 이해하기 편했어요.',
  '실사용 관점에서 도움 되는 글이네요.',
  '핵심만 잘 정리돼서 바로 참고했어요.',
  '저랑 상황이 비슷해서 공감하면서 읽었습니다.',
  '정성글 감사합니다. 다음 글도 기대할게요.',
];

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const toRunnerAccount = (account: {
  accountId: string;
  password: string;
  nickname?: string;
}): NaverAccount => {
  return {
    id: account.accountId,
    password: account.password,
    nickname: account.nickname,
  };
};

const buildCommentText = (writerIndex: number, commentIndex: number): string => {
  const templateIndex = (writerIndex + commentIndex) % COMMENT_TEMPLATES.length;
  return COMMENT_TEMPLATES[templateIndex];
};

const buildPostContext = (title?: string, content?: string): string => {
  const normalizedTitle = (title || '').trim();
  const normalizedContent = (content || '').trim();
  if (!normalizedTitle) return normalizedContent;
  if (!normalizedContent) return normalizedTitle;
  return `${normalizedTitle}\n\n${normalizedContent}`;
};

const generateCommentForArticle = async (
  writer: NaverAccount,
  cafeId: string,
  articleId: number,
  writerIndex: number,
  commentIndex: number
): Promise<{ text: string; warnings: string[] }> => {
  const warnings: string[] = [];
  const fallback = buildCommentText(writerIndex, commentIndex);

  const article = await readCafeArticleContent(writer, cafeId, articleId);
  if (!article.success || !article.content) {
    warnings.push(`read failed #${articleId}: ${article.error || 'no content'}`);
    return { text: fallback, warnings };
  }

  const postContext = buildPostContext(article.title, article.content);
  if (!postContext) {
    warnings.push(`empty context #${articleId}`);
    return { text: fallback, warnings };
  }

  try {
    // comment API currently expects persona_id as integer or omitted.
    // To avoid schema mismatch, persona is omitted here.
    const generated = await generateComment(postContext, null, article.authorNickname);
    if (!generated.trim()) {
      warnings.push(`api empty comment #${articleId}`);
      return { text: fallback, warnings };
    }
    return { text: generated, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    warnings.push(`api failed #${articleId}: ${message}`);
    return { text: fallback, warnings };
  }
};

const removeByArticleId = (articles: CafeArticle[], ids: Set<number>): CafeArticle[] => {
  return articles.filter((article) => !ids.has(article.articleId));
};

const runWriterActivity = async (
  writer: NaverAccount,
  cafe: { name: string; cafeId: string; menuId: string },
  writerIndex: number
): Promise<WriterRunResult> => {
  const result: WriterRunResult = {
    accountId: writer.id,
    cafeName: cafe.name,
    commentsAttempted: 0,
    commentsSucceeded: 0,
    likesAttempted: 0,
    likesSucceeded: 0,
    errors: [],
  };

  const browse = await browseCafePosts(writer, cafe.cafeId, Number(cafe.menuId), {
    perPage: PER_PAGE,
  });

  if (!browse.success) {
    result.errors.push(`browse failed: ${browse.error || 'unknown error'}`);
    return result;
  }

  const filtered = writer.nickname
    ? browse.articles.filter((article) => article.nickname !== writer.nickname)
    : browse.articles;

  const targetPool = filtered.length > 0 ? filtered : browse.articles;
  if (targetPool.length === 0) {
    result.errors.push('no target articles');
    return result;
  }

  const commentTargets = pickRandomArticles(
    targetPool,
    Math.min(COMMENTS_PER_WRITER, targetPool.length)
  );
  const commentedIds = new Set<number>();

  for (let i = 0; i < commentTargets.length; i++) {
    const target = commentTargets[i];
    const { text: comment, warnings } = await generateCommentForArticle(
      writer,
      cafe.cafeId,
      target.articleId,
      writerIndex,
      i
    );

    if (warnings.length > 0) {
      result.errors.push(...warnings);
    }

    result.commentsAttempted += 1;

    const writeResult = await writeCommentWithAccount(
      writer,
      cafe.cafeId,
      target.articleId,
      comment
    );

    if (writeResult.success) {
      result.commentsSucceeded += 1;
      commentedIds.add(target.articleId);
    } else {
      result.errors.push(`comment failed #${target.articleId}: ${writeResult.error || 'unknown error'}`);
    }

    if (ACTION_DELAY_MS > 0) {
      await sleep(ACTION_DELAY_MS);
    }
  }

  const likePoolBase = removeByArticleId(targetPool, commentedIds);
  const likePool = likePoolBase.length > 0 ? likePoolBase : targetPool;
  const likeTargets = pickRandomArticles(
    likePool,
    Math.min(LIKES_PER_WRITER, likePool.length)
  );

  for (const target of likeTargets) {
    result.likesAttempted += 1;
    const likeResult = await likeArticleWithAccount(writer, cafe.cafeId, target.articleId);
    if (likeResult.success) {
      result.likesSucceeded += 1;
    } else {
      result.errors.push(`like failed #${target.articleId}: ${likeResult.error || 'unknown error'}`);
    }

    if (ACTION_DELAY_MS > 0) {
      await sleep(ACTION_DELAY_MS);
    }
  }

  return result;
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const cafes = await Cafe.find({ userId: user.userId, isActive: true })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  let targetCafes = cafes;
  if (TARGET_CAFE_ID) {
    targetCafes = targetCafes.filter((cafe) => cafe.cafeId === TARGET_CAFE_ID);
  }
  if (TARGET_CAFE_NAME) {
    targetCafes = targetCafes.filter((cafe) => cafe.name === TARGET_CAFE_NAME);
  }

  if (targetCafes.length === 0) {
    throw new Error(`no active cafes for loginId=${LOGIN_ID}`);
  }

  const writerAccounts = await Account.find({
    userId: user.userId,
    isActive: true,
    role: 'writer',
  })
    .sort({ isMain: -1, createdAt: 1 })
    .lean();

  if (writerAccounts.length === 0) {
    throw new Error(`no writer accounts for loginId=${LOGIN_ID}`);
  }

  console.log('=== WRITER SIDE ACTIVITY START ===');
  console.log(`loginId: ${LOGIN_ID}`);
  console.log(`userId: ${user.userId}`);
  console.log(`writers: ${writerAccounts.length}`);
  console.log(`cafes: ${targetCafes.length}`);
  if (TARGET_CAFE_ID || TARGET_CAFE_NAME) {
    console.log(`cafe filter: id="${TARGET_CAFE_ID || '-'}", name="${TARGET_CAFE_NAME || '-'}"`);
  }
  console.log(`plan: comments=${COMMENTS_PER_WRITER}, likes=${LIKES_PER_WRITER} per writer`);
  console.log('');

  const results: WriterRunResult[] = [];

  for (let i = 0; i < writerAccounts.length; i++) {
    const dbWriter = writerAccounts[i];
    const writer = toRunnerAccount(dbWriter);
    const cafe = targetCafes[i % targetCafes.length];
    console.log(`[${i + 1}/${writerAccounts.length}] ${writer.id} -> ${cafe.name} (${cafe.cafeId})`);

    const runResult = await runWriterActivity(writer, cafe, i);
    results.push(runResult);

    console.log(
      `  comments ${runResult.commentsSucceeded}/${runResult.commentsAttempted}, likes ${runResult.likesSucceeded}/${runResult.likesAttempted}`
    );
    if (runResult.errors.length > 0) {
      runResult.errors.forEach((error) => console.log(`  - ${error}`));
    }
    console.log('');
  }

  const total = results.reduce(
    (acc, item) => {
      return {
        commentsAttempted: acc.commentsAttempted + item.commentsAttempted,
        commentsSucceeded: acc.commentsSucceeded + item.commentsSucceeded,
        likesAttempted: acc.likesAttempted + item.likesAttempted,
        likesSucceeded: acc.likesSucceeded + item.likesSucceeded,
      };
    },
    {
      commentsAttempted: 0,
      commentsSucceeded: 0,
      likesAttempted: 0,
      likesSucceeded: 0,
    }
  );

  console.log('=== SUMMARY ===');
  console.log(`comments: ${total.commentsSucceeded}/${total.commentsAttempted}`);
  console.log(`likes: ${total.likesSucceeded}/${total.likesAttempted}`);
  console.log(`writers processed: ${results.length}`);
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('run-writer-side-activity failed:', error);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });
