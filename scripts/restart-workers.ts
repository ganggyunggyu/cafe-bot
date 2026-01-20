import { getAllAccounts } from '../src/shared/config/accounts';
import { getTaskQueue, getQueueStatus } from '../src/shared/lib/queue';
import { startAllTaskWorkers } from '../src/shared/lib/queue/workers';
import { connectDB } from '../src/shared/lib/mongodb';

async function main() {
  await connectDB();

  const accounts = await getAllAccounts();
  console.log(`\n=== 계정별 큐 상태 (${accounts.length}개 계정) ===\n`);

  for (const account of accounts) {
    const queue = getTaskQueue(account.id);
    const status = await getQueueStatus(account.id);
    const delayed = await queue.getDelayedCount();

    console.log(`[${account.id}] ${account.nickname || account.id}`);
    console.log(`  대기: ${status.waiting}, 지연: ${delayed}, 활성: ${status.active}, 완료: ${status.completed}, 실패: ${status.failed}`);

    // 대기/지연 중인 Job 목록
    if (status.waiting > 0 || delayed > 0) {
      const waitingJobs = await queue.getWaiting(0, 5);
      const delayedJobs = await queue.getDelayed(0, 5);

      for (const job of [...waitingJobs, ...delayedJobs]) {
        const state = await job.getState();
        const delay = job.opts.delay || 0;
        const processAt = new Date(job.timestamp + delay);
        console.log(`    - [${state}] ${job.data.type}: ${processAt.toLocaleTimeString()}`);
      }
    }
    console.log('');
  }

  console.log('=== 워커 재시작 ===\n');
  await startAllTaskWorkers();
  console.log('\n완료!');

  process.exit(0);
}

main().catch(console.error);
