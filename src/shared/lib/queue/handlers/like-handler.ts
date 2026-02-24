import { LikeJobData, JobResult } from '../types';
import { likeArticleWithAccount } from '@/features/auto-comment/like-writer';
import { NaverAccount } from '@/shared/lib/account-manager';

export interface LikeHandlerContext {
  account: NaverAccount;
  settings: {
    timeout: number;
  };
}

export const handleLikeJob = async (
  data: LikeJobData,
  ctx: LikeHandlerContext
): Promise<JobResult> => {
  const { account, settings } = ctx;

  const result = await Promise.race([
    likeArticleWithAccount(account, data.cafeId, data.articleId),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
    ),
  ]);

  // ARTICLE_NOT_READY: 5분 뒤 재시도 없이 실패 처리 (좋아요는 부가적 작업)
  if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
    console.log(`[WORKER] 좋아요 실패 (글 미준비): ${data.articleId}`);
    return { success: false, error: result.error };
  }

  if (!result.success) {
    throw new Error(result.error || '좋아요 실패');
  }

  return { success: true };
};
