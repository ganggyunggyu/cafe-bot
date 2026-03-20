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
  LikeJobData,
} from './types';
import { addTaskJob, createRescheduleToken, getTaskQueue } from './index';
import { getAllAccounts } from '@/shared/config/accounts';
import { isAccountActive, getNextActiveTime } from '@/shared/lib/account-manager';
import {
  isAccountLoggedIn,
  loginAccount,
  releaseAccountSession,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';
import { getQueueSettings } from '@/shared/models/queue-settings';
import { handlePostJob } from './handlers/post-handler';
import { handleCommentJob } from './handlers/comment-handler';
import { handleReplyJob } from './handlers/reply-handler';
import { handleLikeJob } from './handlers/like-handler';

declare global {
  var __taskWorkers: Map<string, Worker<TaskJobData, JobResult>> | undefined;
  var __generateWorker: Worker<GenerateJobData, JobResult> | null | undefined;
  var __globalJobLock: Promise<void> | null;
  var __globalJobResolver: (() => void) | null;
}

const taskWorkers: Map<string, Worker<TaskJobData, JobResult>> =
  globalThis.__taskWorkers ?? new Map();

if (!globalThis.__taskWorkers) {
  globalThis.__taskWorkers = taskWorkers;
}

let generateWorker: Worker<GenerateJobData, JobResult> | null =
  globalThis.__generateWorker ?? null;

const WORKER_LOCK_DURATION = 10 * 60 * 1000;
const WORKER_LOCK_RENEW_TIME = 30 * 1000;
const WORKER_STALLED_INTERVAL = 2 * 60 * 1000;
const WORKER_MAX_STALLED_COUNT = 3;

if (!globalThis.__globalJobLock) globalThis.__globalJobLock = null;
if (!globalThis.__globalJobResolver) globalThis.__globalJobResolver = null;

const acquireGlobalJobLock = async (): Promise<void> => {
  while (globalThis.__globalJobLock) {
    await globalThis.__globalJobLock;
  }
  let resolver: () => void;
  globalThis.__globalJobLock = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  globalThis.__globalJobResolver = resolver!;
};

const releaseGlobalJobLock = (): void => {
  const resolver = globalThis.__globalJobResolver;
  globalThis.__globalJobLock = null;
  globalThis.__globalJobResolver = null;
  if (resolver) resolver();
};

const syncAccountSessionReservation = async (accountId: string): Promise<void> => {
  const queue = getTaskQueue(accountId);
  const [waitingCount, delayedCount, activeCount] = await Promise.all([
    queue.getWaitingCount(),
    queue.getDelayedCount(),
    queue.getActiveCount(),
  ]);

  if (waitingCount + delayedCount + activeCount > 0) {
    console.log(
      `[SESSION] ${accountId} 예약 세션 유지 (waiting=${waitingCount}, delayed=${delayedCount}, active=${activeCount})`
    );
    return;
  }

  await saveCookiesForAccount(accountId);
  releaseAccountSession(accountId);
};

const processTaskJob = async (
  job: Job<TaskJobData, JobResult>
): Promise<JobResult> => {
  const { data } = job;

  await acquireGlobalJobLock();
  console.log(`[WORKER] 글로벌 락 획득: ${data.type} (${data.accountId})`);

  try {
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

  const loggedIn = await isAccountLoggedIn(account.id);
  if (!loggedIn) {
    console.log(`[WORKER] 로그인 필요 — 로그인 시도: ${account.id}`);
    const loginResult = await loginAccount(account.id, account.password);
    if (!loginResult.success) {
      throw new Error(`로그인 실패: ${loginResult.error}`);
    }
    console.log(`[WORKER] 로그인 완료: ${account.id}`);
  }

  switch (data.type) {
    case 'post':
      return handlePostJob(data as PostJobData, { account, accounts, settings });

    case 'comment':
      return handleCommentJob(data as CommentJobData, { account, settings });

    case 'reply':
      return handleReplyJob(data as ReplyJobData, { account, settings });

    case 'like':
      return handleLikeJob(data as LikeJobData, { account, settings });

    default:
      throw new Error('알 수 없는 작업 타입');
  }
  } finally {
    releaseGlobalJobLock();
    console.log(`[WORKER] 글로벌 락 해제: ${data.type} (${data.accountId})`);
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
    maxStalledCount: WORKER_MAX_STALLED_COUNT,
  });

  worker.on('completed', (job, result) => {
    console.log(
      `[WORKER] 완료: ${job.name} (${accountId})`,
      result.success ? '성공' : '실패'
    );
    syncAccountSessionReservation(accountId).catch(e =>
      console.error(`[WORKER] 세션 동기화 에러 (완료): ${accountId}`, e)
    );
  });

  worker.on('failed', (job, err) => {
    console.error(`[WORKER] 실패: ${job?.name} (${accountId})`, err.message);
    syncAccountSessionReservation(accountId).catch(e =>
      console.error(`[WORKER] 세션 동기화 에러 (실패): ${accountId}`, e)
    );
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
      maxStalledCount: WORKER_MAX_STALLED_COUNT,
    }
  );
  globalThis.__generateWorker = generateWorker;

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
    globalThis.__generateWorker = null;
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
