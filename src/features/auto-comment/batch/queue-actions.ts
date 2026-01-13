'use server';

import { Queue } from 'bullmq';
import { getRedisConnection } from '@/shared/lib/redis';
import { getAllAccounts } from '@/shared/config/accounts';
import { getTaskQueueName } from '@/shared/lib/queue/types';

export interface QueueStatusItem {
  accountId: string;
  queueName: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface AllQueueStatus {
  queues: QueueStatusItem[];
  total: {
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
  };
}

// 모든 계정의 큐 상태 조회
export const getAllQueueStatus = async (): Promise<AllQueueStatus> => {
  const accounts = getAllAccounts();
  const queues: QueueStatusItem[] = [];
  const total = { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 };

  for (const account of accounts) {
    const queueName = getTaskQueueName(account.id);
    const queue = new Queue(queueName, { connection: getRedisConnection() });

    try {
      const [waiting, active, delayed, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getDelayedCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);

      queues.push({
        accountId: account.id,
        queueName,
        waiting,
        active,
        delayed,
        completed,
        failed,
      });

      total.waiting += waiting;
      total.active += active;
      total.delayed += delayed;
      total.completed += completed;
      total.failed += failed;
    } catch (error) {
      console.error(`[QUEUE] ${account.id} 상태 조회 실패:`, error);
    } finally {
      await queue.close();
    }
  }

  return { queues, total };
};

// 특정 계정의 큐 클리어
export const clearAccountQueue = async (accountId: string): Promise<{ success: boolean; message: string }> => {
  const queueName = getTaskQueueName(accountId);
  const queue = new Queue(queueName, { connection: getRedisConnection() });

  try {
    await queue.obliterate({ force: true });
    return { success: true, message: `${accountId} 큐 클리어 완료` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { success: false, message: msg };
  } finally {
    await queue.close();
  }
};

// 모든 큐 클리어
export const clearAllQueues = async (): Promise<{ success: boolean; message: string }> => {
  const accounts = getAllAccounts();
  let cleared = 0;

  for (const account of accounts) {
    const result = await clearAccountQueue(account.id);
    if (result.success) cleared++;
  }

  return { success: true, message: `${cleared}개 계정 큐 클리어 완료` };
};
