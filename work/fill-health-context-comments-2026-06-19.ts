import { writeFileSync } from 'fs';
import { resolve } from 'path';
import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import { PublishedArticle, addCommentToArticle } from '../src/shared/models/published-article';
import { User } from '../src/shared/models/user';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateComment, generateReply } from '../src/shared/api/comment-gen-api';
import {
  writeCommentWithAccount,
  writeReplyWithAccount,
} from '../src/features/auto-comment/comment-writer';
import { closeAllContexts } from '../src/shared/lib/multi-session';
import type { NaverAccount } from '../src/shared/lib/account-manager';

const CAFE_ID = '25636798';
const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const TARGET_COMMENT_COUNT = Math.max(1, Number(process.env.TARGET_COMMENT_COUNT || 4));
const TARGET_REPLY_COUNT = Math.max(0, Number(process.env.TARGET_REPLY_COUNT || 2));
const ACTION_DELAY_MS = Math.max(0, Number(process.env.ACTION_DELAY_MS || 2000));
const OUTPUT_PATH = resolve(
  process.cwd(),
  'outputs/health-context-comment-fill-2026-06-19-freemapleafreecabj.json'
);

type AccountDoc = {
  accountId: string;
  password: string;
  nickname?: string;
  role?: string;
};

type CommentRecord = {
  accountId: string;
  nickname?: string;
  content: string;
  type: 'comment' | 'reply';
  commentId?: string;
  commentIndex?: number;
  parentIndex?: number;
};

type ActionResult = {
  articleId: number;
  title: string;
  type: 'comment' | 'reply';
  accountId?: string;
  parentIndex?: number;
  commentId?: string;
  content: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
};

const TARGET_ARTICLE_IDS = [32124, 32119, 32118, 32107, 32106, 32103];

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
};

const parseArticleIds = (): Set<number> | null => {
  const raw = (process.env.ARTICLE_IDS || '').trim();
  if (!raw) return null;

  return new Set(
    raw
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id))
  );
};

const toNaverAccount = (account: AccountDoc): NaverAccount => ({
  id: account.accountId,
  password: account.password,
  nickname: account.nickname,
  role: account.role === 'commenter' || account.role === 'writer' ? account.role : undefined,
});

const normalizeGenerated = (value: string): string => {
  return value
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
};

const pickAccount = (
  accounts: AccountDoc[],
  blockedIds: Set<string>,
  offset: number
): AccountDoc | null => {
  const candidates = accounts.filter(({ accountId }) => !blockedIds.has(accountId));
  if (candidates.length === 0) return null;
  return candidates[offset % candidates.length];
};

const getMainComments = (comments: CommentRecord[]): CommentRecord[] => {
  return comments.filter(({ type }) => type === 'comment');
};

const getReplies = (comments: CommentRecord[]): CommentRecord[] => {
  return comments.filter(({ type }) => type === 'reply');
};

const buildPostContext = (args: {
  title: string;
  keyword: string;
  body: string;
  commentIndex: number;
  existingComments: string[];
}): string => {
  const { title, keyword, body, commentIndex, existingComments } = args;
  const bodyPreview = body.replace(/\s+/g, ' ').trim().slice(0, 3200);
  const existing = existingComments.length
    ? `\n\n이미 달린 댓글과 겹치지 않게 작성:\n- ${existingComments.join('\n- ')}`
    : '';

  return [
    `[카페 글 제목] ${title}`,
    `[키워드] ${keyword || '-'}`,
    `[본문] ${bodyPreview}`,
    '',
    `[댓글 작성 지시]`,
    `본문을 실제로 읽은 회원처럼 ${commentIndex + 1}번째 본댓글 1개만 작성.`,
    '본문에 나온 구체 포인트를 1개 이상 자연스럽게 언급.',
    '존댓말, 1~2문장, 45~95자.',
    '의료 진단 단정, 과장 광고, 구매 유도, 병원명 홍보 금지.',
    '다른 댓글과 시작어와 말투가 겹치지 않게 작성.',
    existing,
  ].join('\n');
};

const buildFallbackComment = (title: string, index: number): string => {
  const fallbacks = [
    `${title} 관련해서 실제 고민하시는 분들이 많을 것 같아요. 정리된 내용이라 참고가 됩니다.`,
    '본문에 나온 기준을 먼저 보고 상황에 맞게 비교해보는 게 좋겠네요.',
    '경험담처럼 읽히는 부분이 있어서 비슷한 상황인 분들께 도움 될 것 같아요.',
    '막연하게만 생각했는데 체크할 부분을 나눠보니 이해하기 편했습니다.',
  ];
  return fallbacks[index % fallbacks.length];
};

const buildFallbackReply = (index: number): string => {
  const fallbacks = [
    '맞아요, 본문처럼 기준을 나눠서 보면 덜 헷갈리는 것 같아요.',
    '저도 그런 부분이 제일 궁금했는데 댓글 보고 한 번 더 정리됐어요.',
  ];
  return fallbacks[index % fallbacks.length];
};

const generateContextComment = async (args: {
  title: string;
  keyword: string;
  body: string;
  authorNickname?: string;
  commentIndex: number;
  existingComments: string[];
}): Promise<string> => {
  try {
    const generated = await generateComment(
      buildPostContext(args),
      null,
      args.authorNickname
    );
    const normalized = normalizeGenerated(generated);
    if (normalized.length >= 12) return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[GEN] comment fallback: ${message}`);
  }

  return buildFallbackComment(args.title, args.commentIndex);
};

const generateContextReply = async (args: {
  title: string;
  keyword: string;
  body: string;
  parentComment: string;
  authorNickname?: string;
  parentNickname?: string;
  commenterNickname?: string;
  replyIndex: number;
}): Promise<string> => {
  const bodyPreview = args.body.replace(/\s+/g, ' ').trim().slice(0, 2400);
  const context = [
    `[카페 글 제목] ${args.title}`,
    `[키워드] ${args.keyword || '-'}`,
    `[본문] ${bodyPreview}`,
    '',
    `[대댓글 작성 지시]`,
    `아래 원댓글에 이어지는 ${args.replyIndex + 1}번째 대댓글 1개만 작성.`,
    '원댓글 내용에 반응하면서 본문 맥락을 살짝 이어갈 것.',
    '존댓말, 1문장 위주, 35~80자.',
    '의료 진단 단정, 과장 광고, 구매 유도, 병원명 홍보 금지.',
  ].join('\n');

  try {
    const generated = await generateReply(
      context,
      args.parentComment,
      null,
      args.authorNickname,
      args.parentNickname,
      args.commenterNickname
    );
    const normalized = normalizeGenerated(generated);
    if (normalized.length >= 10) return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[GEN] reply fallback: ${message}`);
  }

  return buildFallbackReply(args.replyIndex);
};

const writeOutput = (results: ActionResult[]): void => {
  const payload = {
    cafeId: CAFE_ID,
    targetCommentCount: TARGET_COMMENT_COUNT,
    targetReplyCount: TARGET_REPLY_COUNT,
    attempted: results.filter((item) => !item.skipped).length,
    succeeded: results.filter((item) => item.success && !item.skipped).length,
    failed: results.filter((item) => !item.success && !item.skipped).length,
    skipped: results.filter((item) => item.skipped).length,
    results,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const main = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI missing');

  const articleFilter = parseArticleIds();
  const targetIds = articleFilter
    ? TARGET_ARTICLE_IDS.filter((articleId) => articleFilter.has(articleId))
    : TARGET_ARTICLE_IDS;

  if (targetIds.length === 0) throw new Error('no targets after ARTICLE_IDS filter');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
    role: 'writer',
  })
    .sort({ createdAt: 1 })
    .lean();

  if (accounts.length < 3) throw new Error(`writer accounts are not enough: ${accounts.length}`);

  const results: ActionResult[] = [];

  console.log('=== HEALTH CONTEXT COMMENT FILL RUN ===');
  console.log(`cafeId: ${CAFE_ID}`);
  console.log(`targets: ${targetIds.join(', ')}`);
  console.log(`goal: comments=${TARGET_COMMENT_COUNT}, replies=${TARGET_REPLY_COUNT} per article`);
  console.log(`output: ${OUTPUT_PATH}`);

  for (let targetIndex = 0; targetIndex < targetIds.length; targetIndex++) {
    const articleId = targetIds[targetIndex];
    const article = await PublishedArticle.findOne(
      { cafeId: CAFE_ID, articleId },
      {
        articleId: 1,
        title: 1,
        keyword: 1,
        content: 1,
        writerAccountId: 1,
        commentCount: 1,
        replyCount: 1,
        comments: 1,
      }
    ).lean();

    if (!article) {
      const result: ActionResult = {
        articleId,
        title: '',
        type: 'comment',
        content: '',
        success: false,
        error: 'DB article not found',
      };
      results.push(result);
      writeOutput(results);
      continue;
    }

    const writerAccountId = article.writerAccountId || '';
    const viewer = pickAccount(accounts, new Set([writerAccountId].filter(Boolean)), targetIndex);
    if (!viewer) throw new Error(`no viewer account for article ${articleId}`);

    const live = await readCafeArticleContent(toNaverAccount(viewer), CAFE_ID, articleId);
    const title = live.title || article.title || `article ${articleId}`;
    const body = live.content || article.content || title;
    const authorNickname = live.authorNickname;

    let comments = ((article.comments || []) as CommentRecord[]).filter(({ content }) =>
      Boolean(content?.trim())
    );
    let mainComments = getMainComments(comments);
    let replies = getReplies(comments);

    console.log(
      `#${articleId} "${title}" start comments=${mainComments.length}, replies=${replies.length}, writer=${writerAccountId || '-'}`
    );

    let commentPlanIndex = 0;
    while (mainComments.length < TARGET_COMMENT_COUNT) {
      const account = pickAccount(
        accounts,
        new Set([
          writerAccountId,
          ...mainComments.map(({ accountId }) => accountId),
        ].filter(Boolean)),
        targetIndex + commentPlanIndex
      );

      if (!account) {
        const result: ActionResult = {
          articleId,
          title,
          type: 'comment',
          content: '',
          success: false,
          error: 'No comment account available',
        };
        results.push(result);
        writeOutput(results);
        break;
      }

      const content = await generateContextComment({
        title,
        keyword: article.keyword || '',
        body,
        authorNickname,
        commentIndex: mainComments.length,
        existingComments: mainComments.map(({ content: existingContent }) => existingContent),
      });

      if (mainComments.some((comment) => comment.content === content)) {
        commentPlanIndex += 1;
        continue;
      }

      console.log(
        `  [comment ${mainComments.length + 1}/${TARGET_COMMENT_COUNT}] ${account.accountId}: ${content.slice(0, 42)}`
      );

      const writeResult = await writeCommentWithAccount(
        toNaverAccount(account),
        CAFE_ID,
        articleId,
        content
      );

      if (!writeResult.success) {
        const result: ActionResult = {
          articleId,
          title,
          type: 'comment',
          accountId: account.accountId,
          content,
          success: false,
          error: writeResult.error || 'comment write failed',
        };
        results.push(result);
        console.log(`    ❌ ${result.error}`);
        writeOutput(results);
        if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
        break;
      }

      await addCommentToArticle(CAFE_ID, articleId, {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'comment',
        commentId: writeResult.commentId,
        commentIndex: mainComments.length,
      });

      const record: CommentRecord = {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'comment',
        commentId: writeResult.commentId,
        commentIndex: mainComments.length,
      };

      comments = [...comments, record];
      mainComments = getMainComments(comments);
      commentPlanIndex += 1;

      const result: ActionResult = {
        articleId,
        title,
        type: 'comment',
        accountId: account.accountId,
        content,
        success: true,
        commentId: writeResult.commentId,
      };
      results.push(result);
      console.log(`    ✅ commentId=${writeResult.commentId || '-'}`);
      writeOutput(results);

      if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
    }

    let replyPlanIndex = 0;
    while (replies.length < TARGET_REPLY_COUNT && mainComments.length > 0) {
      const parentIndex = replyPlanIndex % mainComments.length;
      const parent = mainComments[parentIndex];
      const account = pickAccount(
        accounts,
        new Set([writerAccountId, parent.accountId].filter(Boolean)),
        targetIndex + replyPlanIndex + 3
      );

      if (!account) {
        const result: ActionResult = {
          articleId,
          title,
          type: 'reply',
          parentIndex,
          content: '',
          success: false,
          error: 'No reply account available',
        };
        results.push(result);
        writeOutput(results);
        break;
      }

      const content = await generateContextReply({
        title,
        keyword: article.keyword || '',
        body,
        parentComment: parent.content,
        authorNickname,
        parentNickname: parent.nickname || parent.accountId,
        commenterNickname: account.nickname || account.accountId,
        replyIndex: replies.length,
      });

      if (replies.some((reply) => reply.content === content)) {
        replyPlanIndex += 1;
        continue;
      }

      console.log(
        `  [reply ${replies.length + 1}/${TARGET_REPLY_COUNT}] ${account.accountId} -> parent ${parentIndex}: ${content.slice(0, 42)}`
      );

      const writeResult = await writeReplyWithAccount(
        toNaverAccount(account),
        CAFE_ID,
        articleId,
        content,
        parentIndex,
        {
          parentCommentId: parent.commentId,
          parentComment: parent.content,
          parentNickname: parent.nickname || parent.accountId,
        }
      );

      if (!writeResult.success) {
        const result: ActionResult = {
          articleId,
          title,
          type: 'reply',
          accountId: account.accountId,
          parentIndex,
          content,
          success: false,
          error: writeResult.error || 'reply write failed',
        };
        results.push(result);
        console.log(`    ❌ ${result.error}`);
        writeOutput(results);
        if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
        break;
      }

      await addCommentToArticle(CAFE_ID, articleId, {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'reply',
        parentIndex,
      });

      const record: CommentRecord = {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'reply',
        parentIndex,
      };

      comments = [...comments, record];
      replies = getReplies(comments);
      replyPlanIndex += 1;

      const result: ActionResult = {
        articleId,
        title,
        type: 'reply',
        accountId: account.accountId,
        parentIndex,
        content,
        success: true,
      };
      results.push(result);
      console.log('    ✅ reply registered');
      writeOutput(results);

      if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
    }
  }

  const success = results.filter((result) => result.success && !result.skipped).length;
  const failed = results.filter((result) => !result.success && !result.skipped).length;
  const skipped = results.filter((result) => result.skipped).length;
  console.log(`=== DONE: success ${success}, skipped ${skipped}, failed ${failed} ===`);
};

main()
  .then(async () => {
    try {
      await closeAllContexts();
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('fill-health-context-comments failed:', error);
    try {
      await closeAllContexts();
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });
