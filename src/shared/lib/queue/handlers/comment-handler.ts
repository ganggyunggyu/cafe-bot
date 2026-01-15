import { CommentJobData, JobResult } from '../types';
import { addTaskJob } from '../index';
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

  // articleId가 0이고 keyword가 있으면 DB에서 조회 (viral batch)
  let articleId = data.articleId;
  if (articleId === 0 && data.keyword) {
    const foundId = await getArticleIdByKeyword(data.cafeId, data.keyword);
    if (!foundId) {
      console.log(`[WORKER] 글 미발행 - 5분 뒤 재시도: ${data.keyword}`);
      await addTaskJob(data.accountId, data, 5 * 60 * 1000);
      return {
        success: false,
        error: '글 미발행 - 재스케줄됨',
        willRetry: true,
      };
    }
    articleId = foundId;
  }

  // 중복 체크: 이미 이 계정으로 댓글 달았으면 스킵
  const alreadyCommented = await hasCommented(data.cafeId, articleId, account.id, 'comment');
  if (alreadyCommented) {
    console.log(`[WORKER] 중복 댓글 스킵: ${account.id} → #${articleId}`);
    return { success: true };
  }

  const result = await Promise.race([
    writeCommentWithAccount(account, data.cafeId, articleId, data.content),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
    ),
  ]);

  // ARTICLE_NOT_READY 에러: 5분 뒤 재시도
  if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
    const retryDelay = 5 * 60 * 1000;
    console.log(`[WORKER] 글 미준비 - 5분 뒤 재시도: ${articleId}`);
    await addTaskJob(data.accountId, data, retryDelay);
    return { success: false, error: result.error, willRetry: true };
  }

  if (!result.success) {
    throw new Error(result.error || '댓글 작성 실패');
  }

  // DB에 댓글 기록 저장
  try {
    await addCommentToArticle(data.cafeId, articleId, {
      accountId: account.id,
      nickname: account.nickname || account.id,
      content: data.content,
      type: 'comment',
    });
  } catch (dbErr) {
    console.error('[WORKER] 댓글 DB 저장 실패:', dbErr);
  }

  return { success: true };
};
