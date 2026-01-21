import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { getAllAccountsForMonitoring } from '../src/shared/config/accounts';
import { connectDB } from '../src/shared/lib/mongodb';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PORT = process.env.BULL_BOARD_PORT || 3008;

async function main() {
  await connectDB();

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const accounts = await getAllAccountsForMonitoring();
  const accountIds = accounts.map((a) => a.id);

  const queues: Queue[] = [];

  const generateQueue = new Queue('generate', { connection });
  queues.push(generateQueue);

  for (const accountId of accountIds) {
    const safeId = accountId.replace(/[^a-zA-Z0-9]/g, '_');
    const queue = new Queue(`task_${safeId}`, { connection });
    queues.push(queue);
  }

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
    console.log(`[Bull Board] 모니터링 중인 큐: generate, ${accountIds.map((id) => `task_${id}`).join(', ')}`);
  });
}

main().catch(console.error);
