/**
 * writer 계정 큐에서 사이드 활동(comment/like) delayed job만 제거
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/queue-remove-side-jobs.ts
 */

import Redis from 'ioredis';

const WRITER_IDS = ['compare14310', 'fail5644', 'loand3324', 'dyulp', 'gmezz'];

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  let totalRemoved = 0;

  for (const writerId of WRITER_IDS) {
    const prefix = `bull:task_${writerId}`;
    const delayedCount = await redis.zcard(`${prefix}:delayed`);
    if (delayedCount === 0) continue;

    const delayedJobIds = await redis.zrange(`${prefix}:delayed`, 0, -1);
    const toRemove: string[] = [];

    for (const jobId of delayedJobIds) {
      const jobDataStr = await redis.hget(`${prefix}:${jobId}`, 'data');
      if (!jobDataStr) continue;
      const jobData = JSON.parse(jobDataStr);
      if (jobData.type === 'comment' || jobData.type === 'like') {
        toRemove.push(jobId);
        console.log(`  삭제: [${writerId}] ${jobData.type} #${jobData.articleId || '?'}`);
      }
    }

    for (const jobId of toRemove) {
      await redis.zrem(`${prefix}:delayed`, jobId);
      await redis.del(`${prefix}:${jobId}`);
      totalRemoved++;
    }
  }

  console.log(`\n=== 사이드잡 ${totalRemoved}개 삭제 완료 ===`);
  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
