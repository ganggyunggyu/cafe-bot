/**
 * 건강카페 계정 (commenter 14명)의 delayed job 전부 제거
 */
import Redis from 'ioredis';

const HEALTH_ACCOUNTS = [
  '8i2vlbym', 'heavyzebra240', 'njmzdksm', 'e6yb5u4k', 'suc4dce7',
  'xzjmfn3f', '8ua1womn', '0ehz3cb2', 'beautifulelephant274', 'tinyfish183',
  'umhu0m83', 'br5rbg', 'orangeswan630', 'angrykoala270',
];

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  let totalCleared = 0;

  for (const acc of HEALTH_ACCOUNTS) {
    const prefix = `bull:task_${acc}`;
    const delayedJobIds = await redis.zrange(`${prefix}:delayed`, 0, -1);
    const waitingJobIds = await redis.lrange(`${prefix}:wait`, 0, -1);

    for (const jobId of [...delayedJobIds, ...waitingJobIds]) {
      const jobData = await redis.hget(`${prefix}:${jobId}`, 'data');
      if (jobData) {
        const p = JSON.parse(jobData);
        console.log(`  삭제: ${acc} "${p.keyword}" → "${p.subject?.slice(0, 30)}"`);
      }
      await redis.del(`${prefix}:${jobId}`);
      totalCleared++;
    }
    await redis.del(`${prefix}:delayed`);
    await redis.del(`${prefix}:wait`);
  }

  console.log(`\n총 ${totalCleared}개 클리어 완료`);
  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
