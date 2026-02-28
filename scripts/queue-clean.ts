import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379/1', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const main = async () => {
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];
  const allQueues = [...queueNames, 'generate'];

  for (const queueName of allQueues) {
    const queue = new Queue(queueName, {
      connection: { host: 'localhost', port: 6379, db: 1 },
    });

    const waiting = await queue.getWaitingCount();
    const delayed = await queue.getDelayedCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();
    const total = waiting + delayed + active + completed + failed;

    if (total > 0) {
      await queue.obliterate({ force: true });
      console.log(`🗑️  ${queueName}: ${total}건 삭제 (대기${waiting} 예약${delayed} 활성${active} 완료${completed} 실패${failed})`);
    }

    await queue.close();
  }

  console.log('\n✅ 전체 큐 비우기 완료');
  await redis.quit();
  process.exit(0);
};

main().catch((e) => { console.error(e); process.exit(1); });
