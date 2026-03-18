import { Queue } from 'bullmq';
import Redis from 'ioredis';

const TARGET_KEYWORD = '생리주기 불규칙';

const run = async () => {
  const redis = new Redis('redis://localhost:6379/1', { maxRetriesPerRequest: null });
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  let delayed = 0, waiting = 0, active = 0, completed = 0, failed = 0;
  const details: string[] = [];

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: redis });
    const statuses = ['delayed', 'waiting', 'active', 'completed', 'failed'] as const;

    for (const status of statuses) {
      let jobs: any[] = [];
      if (status === 'delayed') jobs = await queue.getDelayed(0, 500);
      else if (status === 'waiting') jobs = await queue.getWaiting(0, 500);
      else if (status === 'active') jobs = await queue.getActive(0, 100);
      else if (status === 'completed') jobs = await queue.getCompleted(0, 500);
      else if (status === 'failed') jobs = await queue.getFailed(0, 500);

      for (const job of jobs) {
        const kw = job.data?.keyword || '';
        if (kw.indexOf(TARGET_KEYWORD) === -1) continue;
        if (job.data?.type === 'post') continue;

        if (status === 'delayed') delayed++;
        if (status === 'waiting') waiting++;
        if (status === 'active') active++;
        if (status === 'completed') {
          completed++;
          const fr = job.failedReason;
          details.push(`[completed] ${job.data.type} ${job.data.accountId}${fr ? ' FAIL:' + fr.slice(0, 50) : ' OK'}`);
        }
        if (status === 'failed') {
          failed++;
          details.push(`[failed] ${job.data.type} ${job.data.accountId} ${(job.failedReason || '').slice(0, 80)}`);
        }
      }
    }
    await queue.close();
  }

  const total = delayed + waiting + active + completed + failed;
  console.log('=== 생리주기 불규칙 큐 모니터링 ===');
  console.log(`대기(delayed): ${delayed}`);
  console.log(`준비(waiting): ${waiting}`);
  console.log(`실행중(active): ${active}`);
  console.log(`완료(completed): ${completed}`);
  console.log(`실패(failed): ${failed}`);
  console.log(`진행률: ${completed}/${total}개`);
  if (details.length > 0) {
    console.log('');
    details.forEach((d) => console.log(`  ${d}`));
  }

  await redis.quit();
  process.exit(0);
};

run().catch(console.error);
