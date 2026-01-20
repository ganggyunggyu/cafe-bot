'use server';

import { runViralBatch, type ViralBatchInput, type ViralBatchResult } from './viral-batch-job';

export const runViralBatchAction = async (input: ViralBatchInput): Promise<ViralBatchResult> => {
  return await runViralBatch(input);
}
