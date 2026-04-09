import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeTaskQueue } from './testing/queue-test-harness';
import {
  createAddTaskJob,
  generateTaskJobId,
  resolveTaskJobDelay,
  type QueueDelaySettings,
} from './task-job-harness';
import type { CommentJobData, PostJobData } from './types';

const TEST_SETTINGS: QueueDelaySettings = {
  delays: {
    betweenComments: { min: 3000, max: 7000 },
    betweenPosts: { min: 1000, max: 5000 },
  },
};

const createPostJobData = (overrides: Partial<PostJobData> = {}): PostJobData => {
  return {
    type: 'post',
    accountId: 'account-a',
    cafeId: 'cafe-a',
    menuId: 'menu-a',
    subject: '테스트 제목',
    content: '본문',
    ...overrides,
  };
};

const createCommentJobData = (overrides: Partial<CommentJobData> = {}): CommentJobData => {
  return {
    type: 'comment',
    accountId: 'account-a',
    cafeId: 'cafe-a',
    articleId: 101,
    content: '댓글 내용',
    ...overrides,
  };
};

test('generateTaskJobId adds sequence and reschedule suffixes for comment jobs', () => {
  const jobId = generateTaskJobId(
    createCommentJobData({
      rescheduleToken: 'retry1',
      sequenceId: 'seq-1',
      sequenceIndex: 2,
    })
  );

  assert.equal(jobId, 'comment_account-a_101_154386b1_seq_seq-1_2_rretry1');
});

test('resolveTaskJobDelay picks post and comment ranges independently', () => {
  const getRandomDelay = ({ min, max }: { min: number; max: number }): number => {
    return max - min;
  };

  assert.equal(resolveTaskJobDelay(createPostJobData(), TEST_SETTINGS, getRandomDelay), 4000);
  assert.equal(resolveTaskJobDelay(createCommentJobData(), TEST_SETTINGS, getRandomDelay), 4000);
  assert.equal(resolveTaskJobDelay(createCommentJobData(), TEST_SETTINGS, getRandomDelay, 250), 250);
});

test('createAddTaskJob skips waiting duplicates and re-adds completed jobs', async () => {
  const { addedJobs, queue, seedJob } = createFakeTaskQueue();
  const logs: string[] = [];
  const addTaskJob = createAddTaskJob({
    getQueueSettings: async () => TEST_SETTINGS,
    getRandomDelay: ({ min }: { min: number }) => min,
    getTaskQueue: () => queue,
    log: (message: string) => logs.push(message),
  });

  const duplicateData = createCommentJobData();
  const duplicateJobId = generateTaskJobId(duplicateData);
  seedJob(duplicateJobId, 'waiting');

  const skippedJob = await addTaskJob('account-a', duplicateData);
  assert.equal(skippedJob, null);
  assert.equal(addedJobs.length, 0);
  assert.match(logs[0] ?? '', /중복 Job 스킵/);

  seedJob(duplicateJobId, 'completed');

  const addedJob = await addTaskJob('account-a', duplicateData);
  assert.notEqual(addedJob, null);
  assert.equal(addedJobs.length, 1);
  assert.equal(addedJobs[0]?.options.jobId, duplicateJobId);
  assert.equal(addedJobs[0]?.options.delay, TEST_SETTINGS.delays.betweenComments.min);
});
