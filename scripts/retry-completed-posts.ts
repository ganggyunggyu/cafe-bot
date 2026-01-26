import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const run = async () => {
  const redis = new Redis(REDIS_URL);

  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  console.log(`발견된 task 큐: ${queueNames.length}개`);

  let totalRetried = 0;

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: { host: 'localhost', port: 6379 } });

    const completed = await queue.getCompleted(0, 1000);
    const postJobs = completed.filter((job) => job.data?.type === 'post');

    if (postJobs.length > 0) {
      console.log(`\n[${queueName}] post 작업 ${postJobs.length}개 발견`);

      for (const job of postJobs) {
        try {
          await job.retry('completed');
          console.log(`  ✅ 재시도: ${job.id}`);
          totalRetried++;
        } catch (err) {
          console.log(`  ❌ 실패: ${job.id} - ${(err as Error).message}`);
        }
      }
    }

    await queue.close();
  }

  console.log(`\n총 ${totalRetried}개 작업 재시도 완료`);

  await redis.quit();
  process.exit(0);
};

run().catch(console.error);
