/**
 * 실패한 스케줄 post 잡을 기존 원고 데이터로 재큐잉
 * Usage: npx tsx --env-file=.env.local scripts/run-schedule-retry.ts
 */

import { Queue } from "bullmq";
import Redis from "ioredis";
import { addTaskJob } from "../src/shared/lib/queue";
import type { PostJobData } from "../src/shared/lib/queue/types";

interface RetryTarget {
  accountId: string;
  keyword: string;
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/1";

const RETRY_TARGETS: RetryTarget[] = [
  {
    accountId: "yenalk",
    keyword: "CHANEL 25 사진 계속 넘겨보다가 점심시간 순삭",
  },
  {
    accountId: "uqgidh2690",
    keyword: "CHANEL 22 매장 사진 보다가 오후 코디 고민",
  },
];

const isFailedCompletedJob = (job: { failedReason?: string | null; returnvalue?: { success?: boolean; error?: string } | null }): boolean => {
  if (job.failedReason) {
    return true;
  }

  const { returnvalue } = job;
  return returnvalue?.success === false || Boolean(returnvalue?.error);
};

const hasQueuedKeyword = async (
  queue: Queue,
  keyword: string,
): Promise<boolean> => {
  const jobs = [
    ...(await queue.getActive(0, 50)),
    ...(await queue.getWaiting(0, 50)),
    ...(await queue.getDelayed(0, 200)),
  ];

  return jobs.some((job) => job.data?.type === "post" && job.data?.keyword === keyword);
};

const findSourceJobData = async (
  queue: Queue,
  keyword: string,
): Promise<PostJobData | null> => {
  const failedJobs = await queue.getFailed(0, 100);
  for (const job of failedJobs) {
    if (job.data?.type === "post" && job.data?.keyword === keyword) {
      return job.data as PostJobData;
    }
  }

  const completedJobs = await queue.getCompleted(0, 200);
  for (const job of completedJobs) {
    if (job.data?.type !== "post" || job.data?.keyword !== keyword) {
      continue;
    }

    if (isFailedCompletedJob(job)) {
      return job.data as PostJobData;
    }
  }

  return null;
};

const main = async (): Promise<void> => {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  try {
    for (const { accountId, keyword } of RETRY_TARGETS) {
      const queueName = `task_${accountId}`;
      const queue = new Queue(queueName, { connection: redis });

      try {
        if (await hasQueuedKeyword(queue, keyword)) {
          console.log(`ℹ️ 이미 큐에 있음: ${accountId} / ${keyword}`);
          continue;
        }

        const sourceJobData = await findSourceJobData(queue, keyword);
        if (!sourceJobData) {
          console.log(`❌ 실패 원고 데이터 없음: ${accountId} / ${keyword}`);
          continue;
        }

        await addTaskJob(accountId, sourceJobData, 0);
        console.log(`✅ 재큐잉 완료: ${accountId} / ${keyword}`);
      } finally {
        await queue.close();
      }
    }
  } finally {
    await redis.quit();
  }
};

main().catch((error) => {
  console.error("retry failed:", error);
  process.exit(1);
});
