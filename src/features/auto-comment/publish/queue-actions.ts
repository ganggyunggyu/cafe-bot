'use server';

import type { PostOnlyInput } from './types';

export interface QueueBatchResult {
  success: boolean;
  jobsAdded: number;
  message: string;
}

export type QueueStatusResult = Record<string, { waiting: number; active: number; completed: number; failed: number }>;

// 글만 발행 (큐 기반) - Redis 필요
export async function runPostOnlyAction(
  input: PostOnlyInput
): Promise<QueueBatchResult> {
  const { keywords, ref, cafeId, postOptions } = input;

  console.log('[POST-ONLY] 큐 추가 시작:', keywords.length, '개 키워드');

  try {
    const { addBatchToQueue } = await import('../batch/batch-queue');
    return addBatchToQueue({
      service: '일반',
      keywords,
      ref,
      cafeId,
      postOptions,
      skipComments: true, // 글만 발행 (댓글/대댓글 스킵)
    });
  } catch (error) {
    console.error('[POST-ONLY] Redis 연결 실패:', error);
    return {
      success: false,
      jobsAdded: 0,
      message: 'Redis 연결 실패 - Redis 서버가 실행 중인지 확인해',
    };
  }
}

// 큐 상태 조회 - Redis 필요
export async function getPostQueueStatusAction(): Promise<QueueStatusResult> {
  try {
    const { getBatchQueueStatus } = await import('../batch/batch-queue');
    return await getBatchQueueStatus();
  } catch (error) {
    console.error('[POST-ONLY QUEUE STATUS] Redis 연결 실패:', error);
    return {};
  }
}
