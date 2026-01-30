import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

async function drainAll() {
  console.log('모든 큐 비우는 중...\n');

  const keys = await redis.keys('bull:*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  console.log(`발견된 큐: ${queueNames.length}개\n`);

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: redis });

    const [waiting, delayed, active] = await Promise.all([
      queue.getWaitingCount(),
      queue.getDelayedCount(),
      queue.getActiveCount(),
    ]);

    const total = waiting + delayed + active;

    if (total > 0) {
      console.log(`${queueName}: ${total}개 작업 삭제 중...`);
      await queue.drain();
      console.log(`  ✓ 완료`);
    }

    await queue.close();
  }

  await redis.quit();
  console.log('\n모든 큐 비움 완료!');
}

drainAll().catch(console.error);
