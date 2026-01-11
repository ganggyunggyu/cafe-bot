'use server';

import { runBatchJob } from './batch-job';
import { runModifyBatchJob, type ModifyBatchInput, type ModifyBatchResult, type ModifyBatchOptions } from './modify-batch-job';
import { runBatchCafeJoin, type BatchJoinResult } from './cafe-join';
import type { BatchJobInput, BatchJobResult, BatchJobOptions } from './types';

export const runBatchPostAction = async (
  input: BatchJobInput,
  options?: BatchJobOptions
): Promise<BatchJobResult> => {
  try {
    const result = await runBatchJob(input, options);
    return result;
  } catch (error) {
    console.error('[BATCH ACTION] 에러 발생:', error);
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
): Promise<BatchJobResult> => {
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
