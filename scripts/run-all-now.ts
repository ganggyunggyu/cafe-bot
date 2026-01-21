/**
 * 모든 예약된 Job을 즉시 실행
 */
import { getAllAccounts } from '../src/shared/config/accounts';
import { getTaskQueue } from '../src/shared/lib/queue';
import { connectDB } from '../src/shared/lib/mongodb';

async function main() {
  await connectDB();

  const accounts = await getAllAccounts();
  let totalPromoted = 0;

  console.log('\n=== 예약된 Job 즉시 실행 ===\n');

  for (const account of accounts) {
    const queue = getTaskQueue(account.id);
    const delayedJobs = await queue.getDelayed();

    if (delayedJobs.length > 0) {
      console.log(`[${account.id}] ${delayedJobs.length}개 Job 즉시 실행`);

      for (const job of delayedJobs) {
        await job.promote(); // 딜레이 제거, 즉시 대기열로 이동
        totalPromoted++;
      }
    }
  }

  console.log(`\n총 ${totalPromoted}개 Job 즉시 실행으로 전환\n`);
  process.exit(0);
}

main().catch(console.error);
