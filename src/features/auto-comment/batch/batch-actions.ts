'use server';

import { runBatchJob } from './batch-job';
import { addBatchToQueue, getBatchQueueStatus, type QueueBatchResult } from './batch-queue';
import { runModifyBatchJob, type ModifyBatchInput, type ModifyBatchResult, type ModifyBatchOptions } from './modify-batch-job';
import { runBatchCafeJoin, type BatchJoinResult } from './cafe-join';
import type { BatchJobInput, BatchJobResult, BatchJobOptions } from './types';

export type QueueStatusResult = Record<string, { waiting: number; active: number; completed: number; failed: number }>;

// 큐 기반 배치 작업 (병렬 처리) - 기본
export const runBatchPostAction = async (
  input: BatchJobInput
): Promise<QueueBatchResult> => {
  console.log('[BATCH ACTION] 큐 추가 시작 - keywords:', input.keywords.length);
  try {
    const result = await addBatchToQueue(input);
    console.log('[BATCH ACTION] 큐 추가 완료 -', result.message);
    return result;
  } catch (error) {
    console.error('[BATCH ACTION] 에러 발생:', error);
    return {
      success: false,
      jobsAdded: 0,
      message: `에러: ${error instanceof Error ? error.message : '알 수 없는 에러'}`,
    };
  }
}

// 직렬 처리 (레거시)
export const runBatchPostLegacyAction = async (
  input: BatchJobInput,
  options?: BatchJobOptions
): Promise<BatchJobResult> => {
  console.log('[BATCH LEGACY] 시작 - keywords:', input.keywords.length);
  try {
    const result = await runBatchJob(input, options);
    console.log('[BATCH LEGACY] 완료 - result:', result.completed, '/', result.totalKeywords);
    return result;
  } catch (error) {
    console.error('[BATCH LEGACY] 에러 발생:', error);
    return {
      success: false,
      totalKeywords: input.keywords.length,
      completed: 0,
      failed: input.keywords.length,
      results: [],
    };
  }
}

// 단일 키워드 테스트용
export const testSingleKeywordAction = async (
  service: string,
  keyword: string,
  ref?: string
): Promise<QueueBatchResult> => {
  return runBatchPostAction({
    service,
    keywords: [keyword],
    ref,
  });
}

// 수정 배치 작업
export const runModifyBatchAction = async (
  input: ModifyBatchInput,
  options?: ModifyBatchOptions
): Promise<ModifyBatchResult> => {
  try {
    const result = await runModifyBatchJob(input, options);
    return result;
  } catch (error) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }
}

// 카페 가입 배치 작업 (전체 계정 → 전체 카페)
export const runCafeJoinBatchAction = async (): Promise<BatchJoinResult> => {
  try {
    const result = await runBatchCafeJoin();
    return result;
  } catch (error) {
    console.error('[CAFE-JOIN ACTION] 에러 발생:', error);
    return {
      success: false,
      total: 0,
      joined: 0,
      alreadyMember: 0,
      failed: 0,
      results: [],
    };
  }
}

// 큐 상태 조회
export const getQueueStatusAction = async (): Promise<QueueStatusResult> => {
  try {
    return await getBatchQueueStatus();
  } catch (error) {
    console.error('[QUEUE STATUS] 에러 발생:', error);
    return {};
  }
}
