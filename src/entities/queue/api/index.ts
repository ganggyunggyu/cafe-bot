'use server';

import { Queue, Job } from 'bullmq';
import type { AccountQueueStatus, QueueOverview, QueueTotals } from '../model';
import { getRedisConnection } from '@/shared/lib/redis';
import { getAllAccounts } from '@/shared/config/accounts';
import { getTaskQueueName, TaskJobData } from '@/shared/lib/queue/types';
import { getAllCafes } from '@/shared/config/cafes';

export type AllQueueStatus = QueueOverview;

export interface JobDetail {
  id: string;
  accountId: string;
  type: 'post' | 'comment' | 'reply';
  cafeId: string;
  cafeName?: string;
  status: 'waiting' | 'active' | 'delayed' | 'completed' | 'failed';
  subject?: string;
  keyword?: string;
  content?: string;
  articleId?: number;
  commentIndex?: number;
  delay?: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  createdAt: number;
}

export interface JobsPage {
  jobs: JobDetail[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface JobsFilter {
  status?: 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'all';
  type?: 'post' | 'comment' | 'reply' | 'all';
  accountId?: string;
  cafeId?: string;
}

export interface QueueSummary {
  total: QueueTotals;
  byType: {
    post: { delayed: number; waiting: number; active: number; completed: number; failed: number };
    comment: { delayed: number; waiting: number; active: number; completed: number; failed: number };
    reply: { delayed: number; waiting: number; active: number; completed: number; failed: number };
  };
  byCafe: { cafeId: string; cafeName: string; count: number }[];
  byAccount: { accountId: string; count: number }[];
}

export const getAllQueueStatus = async (): Promise<AllQueueStatus> => {
  const accounts = await getAllAccounts();
  const queues: AccountQueueStatus[] = [];
  const total: QueueTotals = { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 };

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

export const clearAllQueues = async (): Promise<{ success: boolean; message: string }> => {
  const accounts = await getAllAccounts();
  let cleared = 0;

  for (const account of accounts) {
    const result = await clearAccountQueue(account.id);
    if (result.success) cleared++;
  }

  return { success: true, message: `${cleared}개 계정 큐 클리어 완료` };
};

const jobToDetail = (
  job: Job<TaskJobData>,
  status: JobDetail['status'],
  cafeMap: Map<string, string>
): JobDetail => {
  const data = job.data;
  const now = Date.now();

  const detail: JobDetail = {
    id: job.id || '',
    accountId: data.accountId,
    type: data.type,
    cafeId: data.cafeId,
    cafeName: cafeMap.get(data.cafeId),
    status,
    createdAt: job.timestamp || now,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
  };

  if (data.type === 'post') {
    detail.subject = data.subject;
    detail.keyword = data.keyword;
  } else {
    detail.articleId = data.articleId;
    detail.content = data.content;
    if (data.type === 'reply') {
      detail.commentIndex = data.commentIndex;
    }
  }

  if (status === 'delayed' && job.delay) {
    const scheduledTime = (job.timestamp || now) + job.delay;
    detail.delay = Math.max(0, scheduledTime - now);
  }

  return detail;
};

export const getDetailedJobs = async (
  filter: JobsFilter = {},
  page: number = 1,
  pageSize: number = 20
): Promise<JobsPage> => {
  const accounts = await getAllAccounts();
  const cafes = await getAllCafes();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c.name]));

  const targetAccounts = filter.accountId
    ? accounts.filter((a) => a.id === filter.accountId)
    : accounts;

  const allJobs: JobDetail[] = [];

  for (const account of targetAccounts) {
    const queueName = getTaskQueueName(account.id);
    const queue = new Queue(queueName, { connection: getRedisConnection() });

    try {
      const statusFilter = filter.status || 'all';
      const jobPromises: Promise<Job<TaskJobData>[]>[] = [];

      if (statusFilter === 'all' || statusFilter === 'delayed') {
        jobPromises.push(queue.getDelayed(0, 500) as Promise<Job<TaskJobData>[]>);
      }
      if (statusFilter === 'all' || statusFilter === 'waiting') {
        jobPromises.push(queue.getWaiting(0, 500) as Promise<Job<TaskJobData>[]>);
      }
      if (statusFilter === 'all' || statusFilter === 'active') {
        jobPromises.push(queue.getActive(0, 100) as Promise<Job<TaskJobData>[]>);
      }
      if (statusFilter === 'all' || statusFilter === 'completed') {
        jobPromises.push(queue.getCompleted(0, 100) as Promise<Job<TaskJobData>[]>);
      }
      if (statusFilter === 'all' || statusFilter === 'failed') {
        jobPromises.push(queue.getFailed(0, 100) as Promise<Job<TaskJobData>[]>);
      }

      const results = await Promise.all(jobPromises);

      let idx = 0;
      if (statusFilter === 'all' || statusFilter === 'delayed') {
        results[idx++].forEach((j) => allJobs.push(jobToDetail(j, 'delayed', cafeMap)));
      }
      if (statusFilter === 'all' || statusFilter === 'waiting') {
        results[idx++].forEach((j) => allJobs.push(jobToDetail(j, 'waiting', cafeMap)));
      }
      if (statusFilter === 'all' || statusFilter === 'active') {
        results[idx++].forEach((j) => allJobs.push(jobToDetail(j, 'active', cafeMap)));
      }
      if (statusFilter === 'all' || statusFilter === 'completed') {
        results[idx++].forEach((j) => allJobs.push(jobToDetail(j, 'completed', cafeMap)));
      }
      if (statusFilter === 'all' || statusFilter === 'failed') {
        results[idx++].forEach((j) => allJobs.push(jobToDetail(j, 'failed', cafeMap)));
      }
    } catch (error) {
      console.error(`[QUEUE] ${account.id} jobs 조회 실패:`, error);
    } finally {
      await queue.close();
    }
  }

  let filtered = allJobs;
  if (filter.type && filter.type !== 'all') {
    filtered = filtered.filter((j) => j.type === filter.type);
  }
  if (filter.cafeId) {
    filtered = filtered.filter((j) => j.cafeId === filter.cafeId);
  }

  const statusOrder = { active: 0, delayed: 1, waiting: 2, completed: 3, failed: 4 };
  filtered.sort((a, b) => {
    const orderDiff = statusOrder[a.status] - statusOrder[b.status];
    if (orderDiff !== 0) return orderDiff;
    if (a.status === 'delayed' && b.status === 'delayed') {
      return (a.delay || 0) - (b.delay || 0);
    }
    return b.createdAt - a.createdAt;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const jobs = filtered.slice(start, start + pageSize);

  return { jobs, total, page, pageSize, totalPages };
};

export const getQueueSummary = async (): Promise<QueueSummary> => {
  const { jobs } = await getDetailedJobs({}, 1, 10000);
  const cafes = await getAllCafes();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c.name]));

  const summary: QueueSummary = {
    total: { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 },
    byType: {
      post: { delayed: 0, waiting: 0, active: 0, completed: 0, failed: 0 },
      comment: { delayed: 0, waiting: 0, active: 0, completed: 0, failed: 0 },
      reply: { delayed: 0, waiting: 0, active: 0, completed: 0, failed: 0 },
    },
    byCafe: [],
    byAccount: [],
  };

  const cafeCount = new Map<string, number>();
  const accountCount = new Map<string, number>();

  for (const job of jobs) {
    summary.total[job.status]++;
    summary.byType[job.type][job.status]++;

    if (['delayed', 'waiting', 'active'].includes(job.status)) {
      cafeCount.set(job.cafeId, (cafeCount.get(job.cafeId) || 0) + 1);
      accountCount.set(job.accountId, (accountCount.get(job.accountId) || 0) + 1);
    }
  }

  summary.byCafe = Array.from(cafeCount.entries())
    .map(([cafeId, count]) => ({
      cafeId,
      cafeName: cafeMap.get(cafeId) || cafeId,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  summary.byAccount = Array.from(accountCount.entries())
    .map(([accountId, count]) => ({ accountId, count }))
    .sort((a, b) => b.count - a.count);

  return summary;
};

export const removeJob = async (
  accountId: string,
  jobId: string
): Promise<{ success: boolean; message: string }> => {
  const queueName = getTaskQueueName(accountId);
  const queue = new Queue(queueName, { connection: getRedisConnection() });

  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      return { success: false, message: '작업을 찾을 수 없음' };
    }

    const state = await job.getState();
    if (state === 'active') {
      return { success: false, message: '진행 중인 작업은 삭제할 수 없음' };
    }

    await job.remove();
    return { success: true, message: '작업 삭제 완료' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { success: false, message: msg };
  } finally {
    await queue.close();
  }
};

export const getRelatedJobs = async (articleId: number): Promise<JobDetail[]> => {
  const accounts = await getAllAccounts();
  const cafes = await getAllCafes();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c.name]));
  const relatedJobs: JobDetail[] = [];

  for (const account of accounts) {
    const queueName = getTaskQueueName(account.id);
    const queue = new Queue(queueName, { connection: getRedisConnection() });

    try {
      const [delayed, waiting, active, completed, failed] = await Promise.all([
        queue.getDelayed(0, 1000) as Promise<Job<TaskJobData>[]>,
        queue.getWaiting(0, 1000) as Promise<Job<TaskJobData>[]>,
        queue.getActive(0, 100) as Promise<Job<TaskJobData>[]>,
        queue.getCompleted(0, 100) as Promise<Job<TaskJobData>[]>,
        queue.getFailed(0, 100) as Promise<Job<TaskJobData>[]>,
      ]);

      const processJobs = (jobs: Job<TaskJobData>[], status: JobDetail['status']) => {
        for (const job of jobs) {
          if (job.data.type !== 'post' && job.data.articleId === articleId) {
            relatedJobs.push(jobToDetail(job, status, cafeMap));
          }
        }
      };

      processJobs(delayed, 'delayed');
      processJobs(waiting, 'waiting');
      processJobs(active, 'active');
      processJobs(completed, 'completed');
      processJobs(failed, 'failed');
    } catch (error) {
      console.error(`[QUEUE] ${account.id} 연관 작업 조회 실패:`, error);
    } finally {
      await queue.close();
    }
  }

  const statusOrder = { active: 0, delayed: 1, waiting: 2, completed: 3, failed: 4 };
  relatedJobs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return relatedJobs;
};
