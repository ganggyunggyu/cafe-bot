import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  // 모든 task_ 큐 찾기
  const keys = await connection.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  console.log(`[Retry] ${queueNames.length}개 큐 검색 중...`);

  let totalRetried = 0;

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection });

    // completed 작업 가져오기
    const completedJobs = await queue.getCompleted(0, 100);

    for (const job of completedJobs) {
      const returnValue = job.returnvalue as { success?: boolean; error?: string } | undefined;

      // success: false인 작업만 재시도
      if (returnValue && returnValue.success === false) {
        console.log(`[Retry] ${queueName}/${job.name}: ${returnValue.error || '실패'}`);

        // 작업 데이터로 새 job 추가
        await queue.add(job.name, job.data, {
          removeOnComplete: true,
          removeOnFail: false,
        });

        // 기존 완료된 작업 삭제
        await job.remove();
        totalRetried++;
      }
    }

    await queue.close();
  }

  console.log(`[Retry] 총 ${totalRetried}개 작업 재시도 큐에 추가됨`);

  await connection.quit();
  process.exit(0);
}

main().catch(console.error);
