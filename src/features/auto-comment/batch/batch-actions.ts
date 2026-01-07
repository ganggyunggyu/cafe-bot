'use server';

import { runBatchJob } from './batch-job';
import type { BatchJobInput, BatchJobResult, BatchJobOptions } from './types';

export async function runBatchPostAction(
  input: BatchJobInput,
  options?: BatchJobOptions
): Promise<BatchJobResult> {
  try {
    const result = await runBatchJob(input, options);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
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
export async function testSingleKeywordAction(
  service: string,
  keyword: string,
  ref?: string
): Promise<BatchJobResult> {
  return runBatchPostAction({
    service,
    keywords: [keyword],
    ref,
  });
}
