import { ReplyJobData, JobResult } from '../types';
import { addTaskJob, createRescheduleToken } from '../index';
import { waitForSequenceTurn, advanceSequence } from '../sequence';
import { writeReplyWithAccount } from '@/features/auto-comment/comment-writer';
import { NaverAccount } from '@/shared/lib/account-manager';
import { addCommentToArticle, getArticleComments, getArticleIdByKeyword } from '@/shared/models';

export interface ReplyHandlerContext {
  account: NaverAccount;
  settings: {
    timeout: number;
  };
}

export const handleReplyJob = async (
  data: ReplyJobData,
  ctx: ReplyHandlerContext
): Promise<JobResult> => {
  const { account, settings } = ctx;
  const hasSequence = Boolean(data.sequenceId && data.sequenceIndex !== undefined);

  if (hasSequence) {
    const turn = await waitForSequenceTurn(data.sequenceId!, data.sequenceIndex!);
    if (turn === 'skipped') {
      return { success: true };
    }
  }

  const advanceIfNeeded = async (): Promise<void> => {
    if (hasSequence) {
      await advanceSequence(data.sequenceId!);
    }
  };

  // articleId가 0이고 keyword가 있으면 DB에서 조회 (viral batch)
  let articleId = data.articleId;
  if (articleId === 0 && data.keyword) {
    const foundId = await getArticleIdByKeyword(data.cafeId, data.keyword);
    if (!foundId) {
      console.log(`[WORKER] 글 미발행 - 5분 뒤 재시도: ${data.keyword}`);
      await addTaskJob(
        data.accountId,
        { ...data, rescheduleToken: createRescheduleToken() },
        5 * 60 * 1000
      );
      return {
        success: false,
        error: '글 미발행 - 재스케줄됨',
        willRetry: true,
      };
    }
    articleId = foundId;
  }

  const normalizeText = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  let parentCommentId = data.parentCommentId;

  if (!parentCommentId) {
    try {
      const comments = await getArticleComments(data.cafeId, articleId);
      const mainComments = comments.filter((c) => c.type === 'comment');

      if (data.sequenceId && data.commentIndex !== undefined) {
        const match = mainComments.find(
          (c) => c.sequenceId === data.sequenceId && c.commentIndex === data.commentIndex
        );
        if (match?.commentId) {
          parentCommentId = match.commentId;
        }
      }

      if (!parentCommentId && data.commentIndex !== undefined) {
        const match = mainComments.find((c) => c.commentIndex === data.commentIndex);
        if (match?.commentId) {
          parentCommentId = match.commentId;
        }
      }

      if (!parentCommentId && data.parentComment) {
        const targetPreview = normalizeText(data.parentComment).slice(0, 40);
        const targetNickname = normalizeText(data.parentNickname);
        const match = mainComments.find((c) => {
          const contentMatch = normalizeText(c.content).includes(targetPreview);
          const nicknameMatch = targetNickname ? normalizeText(c.nickname) === targetNickname : true;
          return contentMatch && nicknameMatch;
        });
        if (match?.commentId) {
          parentCommentId = match.commentId;
        }
      }
    } catch (error) {
      console.error('[WORKER] 부모 댓글 ID 조회 실패:', error);
    }
  }

  const result = await Promise.race([
    writeReplyWithAccount(account, data.cafeId, articleId, data.content, data.commentIndex, {
      parentCommentId,
      parentComment: data.parentComment,
      parentNickname: data.parentNickname,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
    ),
  ]);

  // ARTICLE_NOT_READY 에러: 5분 뒤 재시도
  if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
    const retryDelay = 5 * 60 * 1000;
    console.log(`[WORKER] 글/댓글 미준비 - 5분 뒤 재시도: ${articleId}`);
    await addTaskJob(
      data.accountId,
      { ...data, rescheduleToken: createRescheduleToken() },
      retryDelay
    );
    return { success: false, error: result.error, willRetry: true };
  }

  if (!result.success) {
    await advanceIfNeeded();
    throw new Error(result.error || '대댓글 작성 실패');
  }

  // DB에 대댓글 기록 저장
  try {
    await addCommentToArticle(data.cafeId, articleId, {
      accountId: account.id,
      nickname: account.nickname || account.id,
      content: data.content,
      type: 'reply',
      parentIndex: data.commentIndex,
    });
  } catch (dbErr) {
    console.error('[WORKER] 대댓글 DB 저장 실패:', dbErr);
  }

  await advanceIfNeeded();
  return { success: true };
};
