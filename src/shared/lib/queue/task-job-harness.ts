import { createHash } from 'crypto';
import type { DelayRange } from '@/shared/models/queue-settings';
import type { JobResult, PostJobData, TaskJobData } from './types';

export interface QueueDelaySettings {
  delays: {
    betweenPosts: DelayRange;
    betweenComments: DelayRange;
  };
}

export interface ExistingTaskJobLike {
  getState: () => Promise<string>;
}

export interface TaskQueueLike<TJob> {
  getJob: (jobId: string) => Promise<ExistingTaskJobLike | null | undefined>;
  add: (
    name: TaskJobData['type'],
    data: TaskJobData,
    options: { delay: number; jobId: string }
  ) => Promise<TJob>;
}

export interface CreateAddTaskJobDeps<TJob> {
  getTaskQueue: (accountId: string) => TaskQueueLike<TJob>;
  getQueueSettings: () => Promise<QueueDelaySettings>;
  getRandomDelay: (range: DelayRange) => number;
  log?: (message: string) => void;
}

const getContentHash = (value: string): string => {
  return createHash('md5').update(value).digest('hex').slice(0, 8);
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

export const generateTaskJobId = (data: TaskJobData): string => {
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
    case 'like': {
      const hash = getContentHash(`${data.cafeId}_${data.articleId}`);
      return `like_${data.accountId}_${hash}${getRescheduleSuffix(data)}`;
    }
    case 'disable-comment': {
      const hash = getContentHash(`${data.cafeId}_${data.articleId}`);
      return `disablecomment_${data.accountId}_${hash}${getRescheduleSuffix(data)}`;
    }
  }
};

export const resolveTaskJobDelay = (
  data: TaskJobData,
  settings: QueueDelaySettings,
  getRandomDelay: (range: DelayRange) => number,
  delay?: number
): number => {
  if (delay !== undefined) {
    return delay;
  }

  if (data.type === 'post') {
    return getRandomDelay(settings.delays.betweenPosts);
  }

  return getRandomDelay(settings.delays.betweenComments);
};

export const createAddTaskJob = <TJob>({
  getTaskQueue,
  getQueueSettings,
  getRandomDelay,
  log = console.log,
}: CreateAddTaskJobDeps<TJob>) => {
  return async (
    accountId: string,
    data: TaskJobData,
    delay?: number
  ): Promise<TJob | null> => {
    const queue = getTaskQueue(accountId);
    const settings = await getQueueSettings();
    const jobDelay = resolveTaskJobDelay(data, settings, getRandomDelay, delay);
    const jobId = generateTaskJobId(data);

    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (['waiting', 'delayed', 'active'].includes(state)) {
        log(`[QUEUE] 중복 Job 스킵: ${jobId} (상태: ${state})`);
        return null;
      }
    }

    const job = await queue.add(data.type, data, {
      delay: jobDelay,
      jobId,
    });

    log(`[QUEUE] Job 추가: ${data.type} (${accountId}), 딜레이: ${Math.round(jobDelay / 1000)}초`);
    return job;
  };
};

export type { JobResult };
