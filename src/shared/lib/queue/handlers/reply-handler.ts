import { ReplyJobData, JobResult } from '../types';
import { addTaskJob, createRescheduleToken } from '../index';
import { waitForSequenceTurn, advanceSequence } from '../sequence';
import { writeReplyWithAccount } from '@/features/auto-comment/comment-writer';
import { NaverAccount } from '@/shared/lib/account-manager';
import { addCommentToArticle, getArticleComments, getArticleIdByKeyword } from '@/shared/models';
import { invalidateLoginCache } from '@/shared/lib/multi-session';
import { getRedisConnection } from '@/shared/lib/redis';
import { createLogger } from '@/shared/lib/logger';

const log = createLogger('REPLY');

const WRITE_LOCK_TTL = 600;
const SEQUENCE_WAIT_RETRY_MS = 10 * 1000;
const ARTICLE_NOT_READY_RETRY_MS = 5 * 60 * 1000;
const WRITE_FAIL_RETRY_MS = 60 * 1000;
const MAX_ARTICLE_RETRY = 3;
const CONTENT_PREVIEW_LENGTH = 30;
const PARENT_MATCH_PREVIEW_LENGTH = 40;

const acquireWriteLock = async (
  cafeId: string,
  articleId: number,
  accountId: string,
  content: string
): Promise<boolean> => {
  const redis = getRedisConnection();
  const contentKey = content.slice(0, CONTENT_PREVIEW_LENGTH).replace(/\s+/g, '');
  const lockKey = `write_lock:reply:${cafeId}:${articleId}:${accountId}:${contentKey}`;
  const result = await redis.set(lockKey, '1', 'EX', WRITE_LOCK_TTL, 'NX');
  return result === 'OK';
};

const normalizeText = (value: string | null | undefined): string =>
  (value ?? '').replace(/\s+/g, ' ').trim();

const removeSequenceFields = (data: ReplyJobData): Omit<ReplyJobData, 'sequenceId' | 'sequenceIndex'> => {
  const { sequenceId, sequenceIndex, ...rest } = data;
  return rest;
};

const findParentCommentId = async (
  data: ReplyJobData,
  articleId: number
): Promise<string | undefined> => {
  const comments = await getArticleComments(data.cafeId, articleId);
  const mainComments = comments.filter((c) => c.type === 'comment');

  // 1차: sequenceId + commentIndex 매칭
  if (data.sequenceId && data.commentIndex !== undefined) {
    const match = mainComments.find(
      (c) => c.sequenceId === data.sequenceId && c.commentIndex === data.commentIndex
    );
    if (match?.commentId) return match.commentId;
  }

  // 2차: commentIndex만으로 매칭
  if (data.commentIndex !== undefined) {
    const match = mainComments.find((c) => c.commentIndex === data.commentIndex);
    if (match?.commentId) return match.commentId;
  }

  // 3차: 내용 + 닉네임 텍스트 매칭
  if (data.parentComment) {
    const targetPreview = normalizeText(data.parentComment).slice(0, PARENT_MATCH_PREVIEW_LENGTH);
    const targetNickname = normalizeText(data.parentNickname);
    const match = mainComments.find((c) => {
      const contentMatch = normalizeText(c.content).includes(targetPreview);
      const nicknameMatch = targetNickname ? normalizeText(c.nickname) === targetNickname : true;
      return contentMatch && nicknameMatch;
    });
    if (match?.commentId) return match.commentId;
  }

  return undefined;
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
    if (turn === 'skipped') return { success: true };
    if (turn === 'pending') {
      log.info('순서 대기 — 재스케줄', { sequenceId: data.sequenceId, index: data.sequenceIndex });
      await addTaskJob(
        data.accountId,
        { ...data, rescheduleToken: `seqwait_${Date.now().toString(36)}` },
        SEQUENCE_WAIT_RETRY_MS
      );
      return { success: false, error: '순서 대기 - 재스케줄됨', willRetry: true };
    }
  }

  const advanceIfNeeded = async (): Promise<void> => {
    if (hasSequence) await advanceSequence(data.sequenceId!);
  };

  // articleId 해소
  let articleId = data.articleId;

  if (articleId === 0 && !data.keyword) {
    log.warn('articleId=0 + keyword 없음 — 스킵', { accountId: account.id });
    await advanceIfNeeded();
    return { success: false, error: 'articleId=0 + keyword 없음' };
  }

  if (articleId === 0 && data.keyword) {
    const retryCount = (data as Record<string, unknown>)._retryCount as number | undefined;
    if (retryCount && retryCount >= MAX_ARTICLE_RETRY) {
      log.warn('글 미발행 재시도 초과 — 포기', { accountId: account.id, keyword: data.keyword });
      await advanceIfNeeded();
      return { success: false, error: `글 미발행 재시도 ${MAX_ARTICLE_RETRY}회 초과` };
    }

    const foundId = await getArticleIdByKeyword(data.cafeId, data.keyword);
    if (!foundId) {
      log.info('글 미발행 — 재시도 예약', { keyword: data.keyword, retry: (retryCount || 0) + 1 });
      await advanceIfNeeded();
      await addTaskJob(
        data.accountId,
        {
          ...removeSequenceFields(data),
          _retryCount: (retryCount || 0) + 1,
          rescheduleToken: createRescheduleToken(),
        } as ReplyJobData,
        ARTICLE_NOT_READY_RETRY_MS
      );
      return { success: false, error: '글 미발행 - 재스케줄됨', willRetry: true };
    }
    articleId = foundId;
  }

  // 부모 댓글 ID 조회
  let { parentCommentId } = data;
  if (!parentCommentId) {
    try {
      parentCommentId = await findParentCommentId(data, articleId);
    } catch (error) {
      log.error('부모 댓글 ID 조회 실패', { accountId: account.id, articleId, error: String(error) });
    }
  }

  // 쓰기 락
  const lockAcquired = await acquireWriteLock(data.cafeId, articleId, account.id, data.content);
  if (!lockAcquired) {
    log.info('대댓글 작성 락 중복', { accountId: account.id, articleId });
    await advanceIfNeeded();
    return { success: false, error: '대댓글 작성 락 중복 - BullMQ retry 대기' };
  }

  log.info('대댓글 작성 시도', { accountId: account.id, articleId, cafeId: data.cafeId, commentIndex: data.commentIndex });

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

  // 실패 처리
  if (!result.success) {
    const isArticleNotReady = result.error?.startsWith('ARTICLE_NOT_READY:');
    const retryDelay = isArticleNotReady ? ARTICLE_NOT_READY_RETRY_MS : WRITE_FAIL_RETRY_MS;
    const level = isArticleNotReady ? 'warn' : 'error';

    log[level]('대댓글 작성 실패 — 재시도', { accountId: account.id, articleId, error: result.error, delayMs: retryDelay });

    if (!isArticleNotReady) invalidateLoginCache(account.id);
    await advanceIfNeeded();

    await addTaskJob(
      data.accountId,
      { ...removeSequenceFields(data), rescheduleToken: createRescheduleToken() },
      retryDelay
    );
    return { success: false, error: result.error || '대댓글 작성 실패', willRetry: true };
  }

  log.info('대댓글 작성 성공', { accountId: account.id, articleId, commentIndex: data.commentIndex });

  try {
    await addCommentToArticle(data.cafeId, articleId, {
      accountId: account.id,
      nickname: account.nickname || account.id,
      content: data.content,
      type: 'reply',
      parentIndex: data.commentIndex,
    });
  } catch (dbErr) {
    log.error('대댓글 DB 저장 실패', { accountId: account.id, articleId, error: String(dbErr) });
  }

  await advanceIfNeeded();
  return { success: true };
};
