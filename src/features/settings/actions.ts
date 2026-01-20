'use server';

import { connectDB } from '@/shared/lib/mongodb';
import {
  getQueueSettings,
  updateQueueSettings,
  DelayRange,
  DEFAULT_QUEUE_SETTINGS,
} from '@/shared/models/queue-settings';

export interface QueueSettingsData {
  delays: {
    betweenPosts: DelayRange;
    betweenComments: DelayRange;
    afterPost: DelayRange;
  };
  retry: {
    attempts: number;
    backoffDelay: number;
  };
  limits: {
    enableDailyPostLimit: boolean;
    maxCommentsPerAccount: number;
  };
  timeout: number;
}

export const getSettingsAction = async (): Promise<QueueSettingsData> => {
  await connectDB();
  const settings = await getQueueSettings();

  return {
    delays: settings.delays,
    retry: settings.retry,
    limits: settings.limits || { enableDailyPostLimit: false, maxCommentsPerAccount: 1 },
    timeout: settings.timeout,
  };
};

export const updateSettingsAction = async (data: Partial<QueueSettingsData>): Promise<QueueSettingsData> => {
  await connectDB();
  const updated = await updateQueueSettings(data);

  return {
    delays: updated.delays,
    retry: updated.retry,
    limits: updated.limits || { enableDailyPostLimit: true, maxCommentsPerAccount: 1 },
    timeout: updated.timeout,
  };
};

export const resetSettingsAction = async (): Promise<QueueSettingsData> => {
  await connectDB();
  const updated = await updateQueueSettings(DEFAULT_QUEUE_SETTINGS);

  return {
    delays: updated.delays,
    retry: updated.retry,
    limits: updated.limits || { enableDailyPostLimit: true, maxCommentsPerAccount: 1 },
    timeout: updated.timeout,
  };
};
