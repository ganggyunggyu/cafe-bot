'use server';

import { runManualPublish } from './manual-publish-job';
import { runManualModify } from './manual-modify-job';
import type {
  ManualPublishInput,
  ManualPublishResult,
  ManualModifyInput,
  ManualModifyResult,
} from './types';

export const runManualPublishAction = async (
  input: ManualPublishInput
): Promise<ManualPublishResult> => {
  return await runManualPublish(input);
};

export const runManualModifyAction = async (
  input: ManualModifyInput
): Promise<ManualModifyResult> => {
  return await runManualModify(input);
};
