import { CommentJobData, JobResult } from '../types';
import { addTaskJob, createRescheduleToken } from '../index';
import { waitForSequenceTurn, advanceSequence } from '../sequence';
import { writeCommentWithAccount } from '@/features/auto-comment/comment-writer';
import { NaverAccount } from '@/shared/lib/account-manager';
import { hasCommented, addCommentToArticle, getArticleIdByKeyword } from '@/shared/models';

export interface CommentHandlerContext {
  account: NaverAccount;
  settings: {
    timeout: number;
  };
}

export const handleCommentJob = async (
  data: CommentJobData,
  ctx: CommentHandlerContext
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
        { ...data, rescheduleToken: createRescheduleToken() },
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
    const keyword = data.keyword.trim();
    console.log(`[WORKER] 글 조회 시도: cafeId=${data.cafeId}, keyword="${keyword}"`);

    const foundId = await getArticleIdByKeyword(data.cafeId, keyword);
    if (!foundId) {
      const retryCount = data._retryCount ?? 0;
      if (retryCount >= 3) {
        console.error(`[WORKER] 글 조회 실패 (최대 재시도 초과): ${keyword}`);
        await advanceIfNeeded();
        return { success: false, error: '글 조회 실패 - 최대 재시도 초과' };
      }

      console.log(`[WORKER] 글 미발행 - 2분 뒤 재시도 (시퀀스 진행) (${retryCount + 1}/3): ${keyword}`);
      // 시퀀스 advance해서 다음 작업 진행
      await advanceIfNeeded();
      // 리스케줄 시 시퀀스 정보 제거 (독립 실행)
      const { sequenceId, sequenceIndex, ...dataWithoutSequence } = data;
      await addTaskJob(
        data.accountId,
        { ...dataWithoutSequence, _retryCount: retryCount + 1, rescheduleToken: createRescheduleToken() },
        2 * 60 * 1000
      );
      return {
        success: false,
        error: '글 미발행 - 재스케줄됨',
        willRetry: true,
      };
    }
    articleId = foundId;
    console.log(`[WORKER] 글 조회 성공: articleId=${articleId}`);
  }

  if (articleId === 0) {
    console.error(`[WORKER] articleId가 0 - keyword 없음, 댓글 스킵`);
    await advanceIfNeeded();
    return { success: false, error: 'articleId가 0이고 keyword도 없음' };
  }

  // 중복 체크: 이미 이 계정으로 댓글 달았으면 스킵
  const alreadyCommented = await hasCommented(data.cafeId, articleId, account.id, 'comment');
  if (alreadyCommented) {
    console.log(`[WORKER] 중복 댓글 스킵: ${account.id} → #${articleId}`);
    await advanceIfNeeded();
    return { success: true };
  }

  const result = await Promise.race([
    writeCommentWithAccount(account, data.cafeId, articleId, data.content),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
    ),
  ]);

  // ARTICLE_NOT_READY 에러: 5분 뒤 재시도 (시퀀스 없이)
  if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
    const retryDelay = 5 * 60 * 1000;
    console.log(`[WORKER] 글 미준비 - 5분 뒤 재시도 (시퀀스 진행): ${articleId}`);
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
    throw new Error(result.error || '댓글 작성 실패');
  }

  // DB에 댓글 기록 저장
  try {
    await addCommentToArticle(data.cafeId, articleId, {
      accountId: account.id,
      nickname: account.nickname || account.id,
      content: data.content,
      type: 'comment',
      commentId: result.commentId,
      commentIndex: data.commentIndex,
      sequenceId: data.sequenceId,
    });
  } catch (dbErr) {
    console.error('[WORKER] 댓글 DB 저장 실패:', dbErr);
  }

  await advanceIfNeeded();
  return { success: true };
};
