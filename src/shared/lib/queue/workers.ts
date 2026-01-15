import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../redis';
import {
  TaskJobData,
  GenerateJobData,
  JobResult,
  getTaskQueueName,
  GENERATE_QUEUE_NAME,
  PostJobData,
  CommentJobData,
  ReplyJobData,
} from './types';
import { addTaskJob, createRescheduleToken } from './index';
import { getAllAccounts } from '@/shared/config/accounts';
import { isAccountActive, getNextActiveTime } from '@/shared/lib/account-manager';
import { getQueueSettings } from '@/shared/models/queue-settings';
import { handlePostJob } from './handlers/post-handler';
import { handleCommentJob } from './handlers/comment-handler';
import { handleReplyJob } from './handlers/reply-handler';

const taskWorkers: Map<string, Worker<TaskJobData, JobResult>> = new Map();

let generateWorker: Worker<GenerateJobData, JobResult> | null = null;

const WORKER_LOCK_DURATION = 10 * 60 * 1000;
const WORKER_LOCK_RENEW_TIME = 60 * 1000;
const WORKER_STALLED_INTERVAL = 60 * 1000;

const processTaskJob = async (
  job: Job<TaskJobData, JobResult>
): Promise<JobResult> => {
  const { data } = job;
  const settings = await getQueueSettings();

  console.log(`[WORKER] 처리 시작: ${data.type} (${data.accountId})`);

  const accounts = await getAllAccounts();
  const account = accounts.find((a) => a.id === data.accountId);

  if (!account) {
    return { success: false, error: `계정 없음: ${data.accountId}` };
  }

  if (!isAccountActive(account)) {
    const nextActiveDelay = getNextActiveTime(account);
    console.log(
      `[WORKER] 비활동 시간 - ${Math.round(
        nextActiveDelay / 60000
      )}분 뒤 재스케줄: ${data.accountId}`
    );
    await addTaskJob(
      data.accountId,
      { ...data, rescheduleToken: createRescheduleToken() },
      nextActiveDelay
    );
    return {
      success: false,
      error: '비활동 시간대 - 재스케줄됨',
      willRetry: true,
    };
  }

  switch (data.type) {
    case 'post':
      return handlePostJob(data as PostJobData, { account, accounts, settings });

    case 'comment':
      return handleCommentJob(data as CommentJobData, { account, settings });

    case 'reply':
      return handleReplyJob(data as ReplyJobData, { account, settings });

    default:
      throw new Error('알 수 없는 작업 타입');
  }
};

export const createTaskWorker = (
  accountId: string
): Worker<TaskJobData, JobResult> => {
  const queueName = getTaskQueueName(accountId);

  if (taskWorkers.has(accountId)) {
    return taskWorkers.get(accountId)!;
  }

  const worker = new Worker<TaskJobData, JobResult>(queueName, processTaskJob, {
    connection: getRedisConnection(),
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION,
    lockRenewTime: WORKER_LOCK_RENEW_TIME,
    stalledInterval: WORKER_STALLED_INTERVAL,
  });

  worker.on('completed', (job, result) => {
    console.log(
      `[WORKER] 완료: ${job.name} (${accountId})`,
      result.success ? '성공' : '실패'
    );
  });

  worker.on('failed', (job, err) => {
    console.error(`[WORKER] 실패: ${job?.name} (${accountId})`, err.message);
  });

  taskWorkers.set(accountId, worker);
  console.log(`[WORKER] Task 워커 생성: ${accountId}`);

  return worker;
};

export const createGenerateWorker = (
  processGenerate: (job: Job<GenerateJobData>) => Promise<JobResult>
): Worker<GenerateJobData, JobResult> => {
  if (generateWorker) {
    return generateWorker;
  }

  generateWorker = new Worker<GenerateJobData, JobResult>(
    GENERATE_QUEUE_NAME,
    processGenerate,
    {
      connection: getRedisConnection(),
      concurrency: 3,
      lockDuration: WORKER_LOCK_DURATION,
      lockRenewTime: WORKER_LOCK_RENEW_TIME,
      stalledInterval: WORKER_STALLED_INTERVAL,
    }
  );

  generateWorker.on('completed', (job, result) => {
    console.log(
      `[WORKER] Generate 완료: ${job.data.keyword}`,
      result.success ? '성공' : '실패'
    );
  });

  generateWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Generate 실패: ${job?.data.keyword}`, err.message);
  });

  console.log('[WORKER] Generate 워커 생성');

  return generateWorker;
};

export const closeAllWorkers = async (): Promise<void> => {
  for (const [accountId, worker] of taskWorkers) {
    await worker.close();
    console.log(`[WORKER] Task 워커 종료: ${accountId}`);
  }
  taskWorkers.clear();

  if (generateWorker) {
    await generateWorker.close();
    generateWorker = null;
    console.log('[WORKER] Generate 워커 종료');
  }
};

export const startAllTaskWorkers = async (): Promise<void> => {
  const accounts = await getAllAccounts();

  for (const account of accounts) {
    createTaskWorker(account.id);
  }

  console.log(`[WORKER] ${accounts.length}개 계정 워커 시작됨`);
};
