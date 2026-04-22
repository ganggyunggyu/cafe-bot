import Redis from 'ioredis';

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const healthAccounts = [
    '8i2vlbym', 'heavyzebra240', 'njmzdksm', 'e6yb5u4k', 'suc4dce7',
    'xzjmfn3f', '8ua1womn', '0ehz3cb2', 'beautifulelephant274', 'tinyfish183',
    'umhu0m83', 'br5rbg', 'orangeswan630', 'angrykoala270',
  ];
  for (const acc of healthAccounts) {
    const prefix = `bull:task_${acc}`;
    const delayedJobIds = await redis.zrange(`${prefix}:delayed`, 0, -1);
    for (const jobId of delayedJobIds) {
      const jobData = await redis.hget(`${prefix}:${jobId}`, 'data');
      if (!jobData) continue;
      const p = JSON.parse(jobData);
      console.log(`${acc}  kw="${p.keyword}"  subject="${p.subject}"`);
    }
  }
  await redis.quit();
};

main();
