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
  timeout: number;
}

// 설정 조회
export async function getSettingsAction(): Promise<QueueSettingsData> {
  await connectDB();
  const settings = await getQueueSettings();

  return {
    delays: settings.delays,
    retry: settings.retry,
    timeout: settings.timeout,
  };
}

// 설정 업데이트
export async function updateSettingsAction(data: Partial<QueueSettingsData>): Promise<QueueSettingsData> {
  await connectDB();
  const updated = await updateQueueSettings(data);

  return {
    delays: updated.delays,
    retry: updated.retry,
    timeout: updated.timeout,
  };
}

// 기본값으로 초기화
export async function resetSettingsAction(): Promise<QueueSettingsData> {
  await connectDB();
  const updated = await updateQueueSettings(DEFAULT_QUEUE_SETTINGS);

  return {
    delays: updated.delays,
    retry: updated.retry,
    timeout: updated.timeout,
  };
}
