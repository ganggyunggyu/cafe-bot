import Redis from 'ioredis';

const main = async () => {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  const completedKeys = await redis.keys('bull:task_*:completed');
  const failedKeys = await redis.keys('bull:task_*:failed');
  const allKeys = [...completedKeys, ...failedKeys];

  let total = 0;
  for (const key of allKeys) {
    const count = await redis.zcard(key);
    if (count > 0) {
      await redis.del(key);
      console.log(`클리어: ${key} (${count}개)`);
      total += count;
    }
  }

  console.log(`\n완료/실패 잡 총 ${total}개 클리어 완료`);
  await redis.quit();
};

main().catch((e) => { console.error(e); process.exit(1); });
