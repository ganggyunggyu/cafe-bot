import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redis = new Redis({ maxRetriesPerRequest: null });

async function check() {
  const keys = await redis.keys('bull:task_*:*');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  for (const queueName of queueNames) {
    if (queueName.startsWith('task_') === false) continue;

    const queue = new Queue(queueName, { connection: redis });
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);

    if (jobs.length > 0) {
      console.log(`${queueName}: ${jobs.length}개`);
      for (const job of jobs.slice(0, 5)) {
        const info = job.data.keyword || job.data.subject || job.data.type;
        console.log(`  - ${info}`);
      }
    }

    await queue.close();
  }

  await redis.quit();
}

check().catch(console.error);
