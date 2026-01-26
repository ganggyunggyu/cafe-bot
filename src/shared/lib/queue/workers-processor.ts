import { Job } from 'bullmq';
import {
  TaskJobData,
  JobResult,
  PostJobData,
  CommentJobData,
  ReplyJobData,
} from './types';
import { addTaskJob, createRescheduleToken } from './index';
import { getAllAccounts, getAccountById } from '@/shared/config/accounts';
import { isAccountActive, getNextActiveTime } from '@/shared/lib/account-manager';
import { getQueueSettings } from '@/shared/models/queue-settings';
import { handlePostJob } from './handlers/post-handler';
import { handleCommentJob } from './handlers/comment-handler';
import { handleReplyJob } from './handlers/reply-handler';

export const processTaskJob = async (
  job: Job<TaskJobData, JobResult>
): Promise<JobResult> => {
  const { data } = job;
  const settings = await getQueueSettings();

  console.log(`[WORKER] 처리 시작: ${data.type} (${data.accountId})`);

  // userId 있으면 해당 유저 계정들, 없으면 accountId로 직접 조회
  let accounts: Awaited<ReturnType<typeof getAllAccounts>> = [];
  let account: Awaited<ReturnType<typeof getAccountById>> | undefined;

  console.log(`[WORKER] Job userId: ${data.userId || '없음'}`);

  if (data.userId) {
    accounts = await getAllAccounts(data.userId);
    console.log(`[WORKER] userId로 조회된 계정: ${accounts.length}개`);
    account = accounts.find((a) => a.id === data.accountId);
  }

  if (!account) {
    console.log(`[WORKER] accountId로 직접 조회: ${data.accountId}`);
    account = await getAccountById(data.accountId) ?? undefined;
    console.log(`[WORKER] 직접 조회 결과: ${account ? '찾음' : '없음'}`);
    if (account) {
      accounts = [account, ...accounts];
    }
  }

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
