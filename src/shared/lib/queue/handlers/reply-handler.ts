import { ReplyJobData, JobResult } from '../types';
import { addTaskJob, createRescheduleToken } from '../index';
import { waitForSequenceTurn, advanceSequence } from '../sequence';
import { writeReplyWithAccount } from '@/features/auto-comment/comment-writer';
import { NaverAccount } from '@/shared/lib/account-manager';
import { addCommentToArticle, getArticleComments, getArticleIdByKeyword } from '@/shared/models';
import { getRedisConnection } from '@/shared/lib/redis';

const WRITE_LOCK_TTL = 600; // 10분

const acquireWriteLock = async (cafeId: number, articleId: number, accountId: string, content: string): Promise<boolean> => {
  const redis = getRedisConnection();
  const contentKey = content.slice(0, 30).replace(/\s+/g, '');
  const lockKey = `write_lock:reply:${cafeId}:${articleId}:${accountId}:${contentKey}`;
  const result = await redis.set(lockKey, '1', 'EX', WRITE_LOCK_TTL, 'NX');
  return result === 'OK';
};

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
    if (turn === 'pending') {
      const retryDelay = 10 * 1000;
      console.log(`[WORKER] 순서 대기 - ${retryDelay / 1000}초 뒤 재스케줄: ${data.sequenceId}#${data.sequenceIndex}`);
      await addTaskJob(
        data.accountId,
        { ...data, rescheduleToken: 'seqwait' },
        retryDelay
      );
      return {
        success: false,
        error: '순서 대기 - 재스케줄됨',
        willRetry: true,
      };
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
      console.log(`[WORKER] 글 미발행 - 5분 뒤 재시도 (시퀀스 진행): ${data.keyword}`);
      // 시퀀스 advance해서 다음 작업 진행
      await advanceIfNeeded();
      // 리스케줄 시 시퀀스 정보 제거 (독립 실행)
      const { sequenceId, sequenceIndex, ...dataWithoutSequence } = data;
      await addTaskJob(
        data.accountId,
        { ...dataWithoutSequence, rescheduleToken: createRescheduleToken() },
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

  // Redis 락: 동일 대댓글 동시 실행 방지 (stalled job 재실행 / retry 중복 차단)
  const lockAcquired = await acquireWriteLock(data.cafeId, articleId, account.id, data.content);
  if (!lockAcquired) {
    console.log(`[WORKER] 대댓글 작성 락 중복 - 스킵: ${account.id} → #${articleId}`);
    await advanceIfNeeded();
    return { success: true };
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

  // ARTICLE_NOT_READY 에러: 5분 뒤 재시도 (시퀀스 없이)
  if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
    const retryDelay = 5 * 60 * 1000;
    console.log(`[WORKER] 글/댓글 미준비 - 5분 뒤 재시도 (시퀀스 진행): ${articleId}`);
    // 시퀀스 advance해서 다음 작업 진행
    await advanceIfNeeded();
    // 리스케줄 시 시퀀스 정보 제거 (독립 실행)
    const { sequenceId, sequenceIndex, ...dataWithoutSequence } = data;
    await addTaskJob(
      data.accountId,
      { ...dataWithoutSequence, rescheduleToken: createRescheduleToken() },
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
