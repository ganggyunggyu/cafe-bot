import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeById, getDefaultCafe, type CafeConfig } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { startAllTaskWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { getNextActiveTime, type NaverAccount } from '@/shared/lib/account-manager';

export interface BatchContext {
  accounts: NaverAccount[];
  cafe: CafeConfig;
  settings: Awaited<ReturnType<typeof getQueueSettings>>;
}

export interface BatchContextError {
  success: false;
  error: string;
}

export const initBatchContext = async (
  inputCafeId?: string,
  minAccounts: number = 2
): Promise<BatchContext | BatchContextError> => {
  const accounts = await getAllAccounts();
  if (accounts.length < minAccounts) {
    return { success: false, error: `계정이 ${minAccounts}개 이상 필요합니다` };
  }

  const cafe = inputCafeId ? await getCafeById(inputCafeId) : await getDefaultCafe();
  if (!cafe) {
    return { success: false, error: '카페를 찾을 수 없습니다' };
  }

  await connectDB();
  const settings = await getQueueSettings();
  await startAllTaskWorkers();

  return { accounts, cafe, settings };
};

export const isBatchContextError = (
  result: BatchContext | BatchContextError
): result is BatchContextError => {
  return 'success' in result && result.success === false;
};

export interface DelayCalculation {
  delay: number;
  nextGlobalDelay: number;
}

export const calculateJobDelay = (
  account: NaverAccount,
  currentGlobalDelay: number,
  delayType: 'betweenPosts' | 'betweenComments' | 'afterPost',
  settings: Awaited<ReturnType<typeof getQueueSettings>>
): DelayCalculation => {
  const activityDelay = getNextActiveTime(account);
  const delay = Math.max(currentGlobalDelay, activityDelay);
  const randomDelay = getRandomDelay(settings.delays[delayType]);
  const nextGlobalDelay = delay + randomDelay;

  return { delay, nextGlobalDelay };
};
