/**
 * 모든 계정 큐의 delayed/waiting job 클리어
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/queue-clear-all.ts
 */

import Redis from 'ioredis';

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  // 모든 계정 큐 찾기
  const idKeys = await redis.keys('bull:task_*:id');
  const queueNames = idKeys.map((k) => k.replace(':id', '').replace('bull:', ''));

  console.log(`=== 큐 ${queueNames.length}개 발견 ===\n`);

  let totalCleared = 0;

  for (const queueName of queueNames) {
    const prefix = `bull:${queueName}`;

    // delayed jobs
    const delayedCount = await redis.zcard(`${prefix}:delayed`);
    // waiting jobs
    const waitingCount = await redis.llen(`${prefix}:wait`);
    // active jobs
    const activeCount = await redis.llen(`${prefix}:active`);

    if (delayedCount === 0 && waitingCount === 0) continue;

    console.log(`${queueName}: delayed=${delayedCount}, waiting=${waitingCount}, active=${activeCount}`);

    // delayed jobs 제거
    if (delayedCount > 0) {
      const delayedJobIds = await redis.zrange(`${prefix}:delayed`, 0, -1);
      for (const jobId of delayedJobIds) {
        const jobData = await redis.hget(`${prefix}:${jobId}`, 'data');
        if (jobData) {
          const parsed = JSON.parse(jobData);
          console.log(`  삭제: [${jobId}] ${parsed.type} ${parsed.accountId}${parsed.articleId ? ` #${parsed.articleId}` : ''}${parsed.keyword ? ` "${parsed.keyword?.slice(0, 15)}"` : ''}`);
        }
        // job 데이터 삭제
        await redis.del(`${prefix}:${jobId}`);
        totalCleared++;
      }
      // delayed sorted set 클리어
      await redis.del(`${prefix}:delayed`);
    }

    // waiting jobs 제거
    if (waitingCount > 0) {
      const waitingJobIds: string[] = [];
      let cursor = 0;
      while (true) {
        const jobId = await redis.lindex(`${prefix}:wait`, cursor);
        if (!jobId) break;
        waitingJobIds.push(jobId);
        cursor++;
      }
      for (const jobId of waitingJobIds) {
        await redis.del(`${prefix}:${jobId}`);
        totalCleared++;
      }
      await redis.del(`${prefix}:wait`);
    }
  }

  console.log(`\n=== 총 ${totalCleared}개 job 클리어 완료 ===`);

  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
