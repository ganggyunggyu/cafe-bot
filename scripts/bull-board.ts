import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PORT = process.env.BULL_BOARD_PORT || 3008;

async function main() {
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // Redis에서 실제 존재하는 모든 큐 찾기
  const keys = await connection.keys('bull:*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))].sort();

  console.log(`[Bull Board] 발견된 큐: ${queueNames.length}개`);

  const queues: Queue[] = [];

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection });
    queues.push(queue);
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/');

  const board = createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  const app = express();
  app.use('/', serverAdapter.getRouter());

  // 5초마다 새로운 큐 체크해서 추가
  setInterval(async () => {
    const newKeys = await connection.keys('bull:*:id');
    const newQueueNames = [...new Set(newKeys.map((k) => k.split(':')[1]))];

    for (const queueName of newQueueNames) {
      const exists = queues.some((q) => q.name === queueName);
      if (exists === false) {
        const queue = new Queue(queueName, { connection });
        queues.push(queue);
        board.addQueue(new BullMQAdapter(queue));
        console.log(`[Bull Board] 새 큐 추가: ${queueName}`);
      }
    }
  }, 5000);

  app.listen(PORT, () => {
    console.log(`[Bull Board] http://localhost:${PORT} 에서 실행 중`);
    console.log(`[Bull Board] 모니터링 중인 큐: ${queueNames.join(', ')}`);
  });
}

main().catch(console.error);
