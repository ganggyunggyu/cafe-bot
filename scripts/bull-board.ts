import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PORT = process.env.BULL_BOARD_PORT || 3008;

// 계정 ID 목록
const ACCOUNT_IDS = ['akepzkthf12', 'qwzx16', 'ggg8019'];

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// 큐 생성
const queues: Queue[] = [];

// Generate 큐
const generateQueue = new Queue('generate', { connection });
queues.push(generateQueue);

// 계정별 Task 큐
for (const accountId of ACCOUNT_IDS) {
  const safeId = accountId.replace(/[^a-zA-Z0-9]/g, '_');
  const queue = new Queue(`task_${safeId}`, { connection });
  queues.push(queue);
}

// Bull Board 설정
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');

createBullBoard({
  queues: queues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

const app = express();
app.use('/', serverAdapter.getRouter());

app.listen(PORT, () => {
  console.log(`[Bull Board] http://localhost:${PORT} 에서 실행 중`);
  console.log(`[Bull Board] 모니터링 중인 큐: generate, ${ACCOUNT_IDS.map((id) => `task_${id}`).join(', ')}`);
});
