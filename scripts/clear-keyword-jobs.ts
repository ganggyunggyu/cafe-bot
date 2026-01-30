import { Queue } from 'bullmq';
import Redis from 'ioredis';

const keyword = process.argv[2] || '하수오';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

async function clearKeywordJobs() {
  console.log(`키워드 "${keyword}" 관련 작업 삭제 중...`);

  const keys = await redis.keys('bull:task_*:*');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  console.log('찾은 큐들:', queueNames);

  let deletedCount = 0;

  for (const queueName of queueNames) {
    if (!queueName.startsWith('task_')) continue;

    const queue = new Queue(queueName, { connection: redis });
    const jobs = await queue.getJobs(['waiting', 'delayed']);

    for (const job of jobs) {
      const data = job.data;
      if (data.keyword?.includes(keyword) || data.subject?.includes(keyword)) {
        console.log(`삭제: ${job.id}`);
        await job.remove();
        deletedCount++;
      }
    }

    await queue.close();
  }

  const genQueue = new Queue('generate', { connection: redis });
  const genJobs = await genQueue.getJobs(['waiting', 'delayed']);
  for (const job of genJobs) {
    if (job.data.keyword?.includes(keyword)) {
      console.log(`삭제: ${job.id}`);
      await job.remove();
      deletedCount++;
    }
  }
  await genQueue.close();

  await redis.quit();
  console.log(`완료: ${deletedCount}개 작업 삭제됨`);
}

clearKeywordJobs().catch(console.error);
