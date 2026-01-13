import { Queue, Job } from 'bullmq';
import { getRedisConnection } from '../redis';
import {
  TaskJobData,
  GenerateJobData,
  JobResult,
  getTaskQueueName,
  GENERATE_QUEUE_NAME,
} from './types';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';

// 계정별 큐 캐시
const taskQueues: Map<string, Queue<TaskJobData, JobResult>> = new Map();

// AI 생성 큐 (싱글톤)
let generateQueue: Queue<GenerateJobData, JobResult> | null = null;

// 계정별 Task 큐 가져오기 (없으면 생성)
export const getTaskQueue = (accountId: string): Queue<TaskJobData, JobResult> => {
  const queueName = getTaskQueueName(accountId);

  if (!taskQueues.has(accountId)) {
    const queue = new Queue<TaskJobData, JobResult>(queueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    taskQueues.set(accountId, queue);
    console.log(`[QUEUE] Task 큐 생성: ${queueName}`);
  }

  return taskQueues.get(accountId)!;
};

// AI 생성 큐 가져오기
export const getGenerateQueue = (): Queue<GenerateJobData, JobResult> => {
  if (!generateQueue) {
    generateQueue = new Queue<GenerateJobData, JobResult>(GENERATE_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    console.log(`[QUEUE] Generate 큐 생성`);
  }

  return generateQueue;
};

// Task Job 추가 (랜덤 딜레이 적용)
export const addTaskJob = async (
  accountId: string,
  data: TaskJobData,
  delay?: number
): Promise<Job<TaskJobData, JobResult>> => {
  const queue = getTaskQueue(accountId);
  const settings = await getQueueSettings();

  // 딜레이 결정
  let jobDelay = delay;
  if (jobDelay === undefined) {
    if (data.type === 'post') {
      jobDelay = getRandomDelay(settings.delays.betweenPosts);
    } else {
      jobDelay = getRandomDelay(settings.delays.betweenComments);
    }
  }

  const job = await queue.add(data.type, data, {
    delay: jobDelay,
    jobId: `${data.type}_${accountId}_${Date.now()}`,
  });

  console.log(`[QUEUE] Job 추가: ${data.type} (${accountId}), 딜레이: ${Math.round(jobDelay / 1000)}초`);
  return job;
};

// Generate Job 추가
export const addGenerateJob = async (
  data: GenerateJobData
): Promise<Job<GenerateJobData, JobResult>> => {
  const queue = getGenerateQueue();

  const job = await queue.add('generate', data, {
    jobId: `generate_${data.keyword}_${Date.now()}`,
  });

  console.log(`[QUEUE] Generate Job 추가: ${data.keyword}`);
  return job;
};

// 모든 큐 종료
export const closeAllQueues = async (): Promise<void> => {
  for (const [accountId, queue] of taskQueues) {
    await queue.close();
    console.log(`[QUEUE] Task 큐 종료: ${accountId}`);
  }
  taskQueues.clear();

  if (generateQueue) {
    await generateQueue.close();
    generateQueue = null;
    console.log(`[QUEUE] Generate 큐 종료`);
  }
};

// 특정 계정 큐 상태 조회
export const getQueueStatus = async (accountId: string) => {
  const queue = getTaskQueue(accountId);
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
};

// 모든 활성 큐 목록
export const getActiveQueueIds = (): string[] => {
  return Array.from(taskQueues.keys());
};
