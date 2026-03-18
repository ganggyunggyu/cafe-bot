/**
 * 작업 전 환경 정리 스크립트
 * - 좀비 크롬 프로세스 전부 종료
 * - Redis 큐의 completed/failed job 데이터 정리
 *
 * Usage:
 *   npx tsx scripts/cleanup.ts
 */

import { execSync } from "child_process";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/1";

const killZombieChrome = (): number => {
  try {
    const count = execSync(
      'ps aux | grep "Google Chrome for Testing" | grep -v grep | wc -l',
    )
      .toString()
      .trim();
    const n = parseInt(count, 10);

    if (n === 0) {
      console.log("[크롬] 좀비 프로세스 없음 ✅");
      return 0;
    }

    execSync('pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true');
    console.log(`[크롬] ${n}개 프로세스 종료 ✅`);
    return n;
  } catch {
    console.log("[크롬] 정리 완료 ✅");
    return 0;
  }
};

const cleanQueueJobs = async (): Promise<{
  completed: number;
  failed: number;
}> => {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  const idKeys = await redis.keys("bull:task_*:id");
  const queueNames = idKeys.map((k) =>
    k.replace(":id", "").replace("bull:", ""),
  );

  let totalCompleted = 0;
  let totalFailed = 0;

  const getIds = async (key: string): Promise<string[]> => {
    const keyType = await redis.type(key);
    if (keyType === "list") return redis.lrange(key, 0, -1);
    if (keyType === "zset") return redis.zrange(key, 0, -1);
    if (keyType === "set") return redis.smembers(key);
    return [];
  };

  for (const queueName of queueNames) {
    const prefix = `bull:${queueName}`;

    const completedIds = await getIds(`${prefix}:completed`);
    const failedIds = await getIds(`${prefix}:failed`);

    if (completedIds.length === 0 && failedIds.length === 0) continue;

    for (const jobId of completedIds) {
      await redis.del(`${prefix}:${jobId}`);
      await redis.del(`${prefix}:${jobId}:logs`);
    }
    if (completedIds.length > 0) {
      await redis.del(`${prefix}:completed`);
      totalCompleted += completedIds.length;
    }

    for (const jobId of failedIds) {
      await redis.del(`${prefix}:${jobId}`);
      await redis.del(`${prefix}:${jobId}:logs`);
    }
    if (failedIds.length > 0) {
      await redis.del(`${prefix}:failed`);
      totalFailed += failedIds.length;
    }

    if (completedIds.length > 0 || failedIds.length > 0) {
      console.log(
        `[큐] ${queueName}: completed ${completedIds.length}개, failed ${failedIds.length}개 정리`,
      );
    }
  }

  await redis.quit();
  return { completed: totalCompleted, failed: totalFailed };
};

const main = async () => {
  console.log("=== 환경 정리 시작 ===\n");

  const chromeKilled = killZombieChrome();

  const { completed, failed } = await cleanQueueJobs();

  console.log("\n=== 정리 완료 ===");
  console.log(`크롬: ${chromeKilled}개 종료`);
  console.log(`큐: completed ${completed}개 + failed ${failed}개 삭제`);
};

main().catch((e) => {
  console.error("cleanup 실패:", e);
  process.exit(1);
});
