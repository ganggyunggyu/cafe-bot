import { Queue, Job } from 'bullmq';
import { getRedisConnection } from '../redis';
import {
  TaskJobData,
  GenerateJobData,
  JobResult,
  getTaskQueueName,
  GENERATE_QUEUE_NAME,
  PostJobData,
} from './types';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { createHash } from 'crypto';

const getContentHash = (str: string): string => {
  return createHash('md5').update(str).digest('hex').slice(0, 8);
};

const getSequenceSuffix = (data: { sequenceId?: string; sequenceIndex?: number }): string => {
  if (!data.sequenceId || data.sequenceIndex === undefined) {
    return '';
  }

  return `_seq_${data.sequenceId}_${data.sequenceIndex}`;
};

const getRescheduleSuffix = (data: { rescheduleToken?: string }): string => {
  if (!data.rescheduleToken) {
    return '';
  }

  return `_r${data.rescheduleToken}`;
};

export const createRescheduleToken = (): string => {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${now}_${rand}`;
};

const taskQueues: Map<string, Queue<TaskJobData, JobResult>> = new Map();

let generateQueue: Queue<GenerateJobData, JobResult> | null = null;

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

const generateJobId = (data: TaskJobData): string => {
  switch (data.type) {
    case 'post': {
      const postData = data as PostJobData;
      const hash = getContentHash(postData.subject);
      return `post_${data.accountId}_${hash}${getRescheduleSuffix(postData)}`;
    }
    case 'comment': {
      const sequenceSuffix = getSequenceSuffix(data);
      const rescheduleSuffix = getRescheduleSuffix(data);
      return `comment_${data.accountId}_${data.articleId}_${getContentHash(data.content)}${sequenceSuffix}${rescheduleSuffix}`;
    }
    case 'reply': {
      const sequenceSuffix = getSequenceSuffix(data);
      const rescheduleSuffix = getRescheduleSuffix(data);
      return `reply_${data.accountId}_${data.articleId}_${data.commentIndex}_${getContentHash(data.content)}${sequenceSuffix}${rescheduleSuffix}`;
    }
  }
};

export const addTaskJob = async (
  accountId: string,
  data: TaskJobData,
  delay?: number
): Promise<Job<TaskJobData, JobResult> | null> => {
  const queue = getTaskQueue(accountId);
  const settings = await getQueueSettings();

  let jobDelay = delay;
  if (jobDelay === undefined) {
    if (data.type === 'post') {
      jobDelay = getRandomDelay(settings.delays.betweenPosts);
    } else {
      jobDelay = getRandomDelay(settings.delays.betweenComments);
    }
  }

  const jobId = generateJobId(data);

  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (['waiting', 'delayed', 'active'].includes(state)) {
      console.log(`[QUEUE] 중복 Job 스킵: ${jobId} (상태: ${state})`);
      return null;
    }
  }

  const job = await queue.add(data.type, data, {
    delay: jobDelay,
    jobId,
  });

  console.log(`[QUEUE] Job 추가: ${data.type} (${accountId}), 딜레이: ${Math.round(jobDelay / 1000)}초`);
  return job;
};

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
