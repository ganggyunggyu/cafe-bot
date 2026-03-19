import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';

const getIds = async (redis: Redis, key: string): Promise<string[]> => {
  const keyType = await redis.type(key);
  if (keyType === 'zset') return redis.zrange(key, 0, -1);
  if (keyType === 'list') return redis.lrange(key, 0, -1);
  if (keyType === 'set') return redis.smembers(key);
  return [];
};

const main = async () => {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const idKeys = await redis.keys('bull:task_*:id');
  const queueNames = idKeys.map((key) => key.replace(':id', '').replace('bull:', ''));

  let totalCompleted = 0;
  let totalFailed = 0;

  for (const queueName of queueNames) {
    const prefix = `bull:${queueName}`;
    const completedIds = await getIds(redis, `${prefix}:completed`);
    const failedIds = await getIds(redis, `${prefix}:failed`);

    for (const jobId of completedIds) {
      await redis.del(`${prefix}:${jobId}`);
      await redis.del(`${prefix}:${jobId}:logs`);
    }

    for (const jobId of failedIds) {
      await redis.del(`${prefix}:${jobId}`);
      await redis.del(`${prefix}:${jobId}:logs`);
    }

    if (completedIds.length > 0) {
      await redis.del(`${prefix}:completed`);
      totalCompleted += completedIds.length;
    }

    if (failedIds.length > 0) {
      await redis.del(`${prefix}:failed`);
      totalFailed += failedIds.length;
    }

    if (completedIds.length > 0 || failedIds.length > 0) {
      console.log(
        `${queueName}: completed ${completedIds.length}개, failed ${failedIds.length}개 삭제`,
      );
    }
  }

  console.log(`\n완료 ${totalCompleted}개 + 실패 ${totalFailed}개 삭제 완료`);
  await redis.quit();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
