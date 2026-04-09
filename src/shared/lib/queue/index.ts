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
import {
  createAddTaskJob,
  createRescheduleToken,
  generateTaskJobId,
  resolveTaskJobDelay,
} from './task-job-harness';

const taskQueues: Map<string, Queue<TaskJobData, JobResult>> = new Map();

let generateQueue: Queue<GenerateJobData, JobResult> | null = null;

export const getTaskQueue = (accountId: string): Queue<TaskJobData, JobResult> => {
  const queueName = getTaskQueueName(accountId);

  if (!taskQueues.has(accountId)) {
    const queue = new Queue<TaskJobData, JobResult>(queueName, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
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

export const addTaskJob = createAddTaskJob<Job<TaskJobData, JobResult>>({
  getQueueSettings,
  getRandomDelay,
  getTaskQueue,
  log: (message: string) => console.log(message),
});

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

export const getActiveQueueIds = (): string[] => {
  return Array.from(taskQueues.keys());
};

export { startAllTaskWorkers } from './workers';
export { createRescheduleToken, generateTaskJobId, resolveTaskJobDelay };
