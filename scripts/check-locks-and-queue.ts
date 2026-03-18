import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';

const run = async () => {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  // 1. 생리주기 불규칙 write lock 체크
  const locks620 = await redis.keys('write_lock:*:620:*');
  console.log('=== 생리주기 불규칙 (620) write lock ===');
  console.log(`개수: ${locks620.length}`);
  for (const k of locks620) {
    const ttl = await redis.ttl(k);
    console.log(`  ${k} (TTL: ${ttl}초)`);
  }

  // 2. 난임 한약 비용 관련 큐 체크
  console.log('\n=== 난임 한약 비용 큐 검색 ===');
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  const statusMap: Record<string, number> = { delayed: 0, waiting: 0, active: 0, completed: 0, failed: 0 };
  const details: string[] = [];

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: redis });

    for (const status of ['delayed', 'waiting', 'active', 'completed', 'failed'] as const) {
      let jobs: any[] = [];
      if (status === 'delayed') jobs = await queue.getDelayed(0, 500);
      else if (status === 'waiting') jobs = await queue.getWaiting(0, 500);
      else if (status === 'active') jobs = await queue.getActive(0, 100);
      else if (status === 'completed') jobs = await queue.getCompleted(0, 500);
      else if (status === 'failed') jobs = await queue.getFailed(0, 500);

      for (const job of jobs) {
        const kw = job.data?.keyword || '';
        const subject = job.data?.subject || '';
        if (kw.indexOf('난임 한약 비용') === -1 && subject.indexOf('난임 한약 비용') === -1) continue;

        statusMap[status]++;
        const fr = job.failedReason;
        details.push(`[${status}] ${job.data.type} ${job.data.accountId} articleId=${job.data.articleId || '?'}${fr ? ' FAIL:' + fr.slice(0, 60) : ''}`);
      }
    }
    await queue.close();
  }

  const total = Object.values(statusMap).reduce((a, b) => a + b, 0);
  console.log(`대기: ${statusMap.delayed} | 준비: ${statusMap.waiting} | 실행: ${statusMap.active} | 완료: ${statusMap.completed} | 실패: ${statusMap.failed}`);
  console.log(`총: ${total}개`);
  if (details.length > 0) {
    details.forEach((d) => console.log(`  ${d}`));
  } else {
    console.log('  (큐에 해당 키워드 작업 없음)');
  }

  // 3. 난임 한약 비용 write lock 체크
  const allLocks = await redis.keys('write_lock:*');
  const nanimLocks = allLocks.filter((k) => k.includes('난임') || k.includes('한약'));
  console.log(`\n=== 난임 한약 비용 write lock ===`);
  console.log(`개수: ${nanimLocks.length}`);
  for (const k of nanimLocks) {
    const ttl = await redis.ttl(k);
    console.log(`  ${k} (TTL: ${ttl}초)`);
  }

  await redis.quit();
  process.exit(0);
};

run().catch(console.error);
