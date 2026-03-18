import { Queue } from 'bullmq';
import Redis from 'ioredis';

const run = async () => {
  const redis = new Redis('redis://localhost:6379/1', { maxRetriesPerRequest: null });
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  for (const qn of queueNames) {
    const queue = new Queue(qn, { connection: redis });
    const completed = await queue.getCompleted(0, 500);

    for (const job of completed) {
      const kw = job.data?.keyword || '';
      const subject = job.data?.subject || '';
      if (kw.indexOf('난임 한약 비용') === -1 && subject.indexOf('난임 한약 비용') === -1) continue;

      console.log('=== 난임 한약 비용 POST 잡 상세 ===');
      console.log('id:', job.id);
      console.log('type:', job.data.type);
      console.log('account:', job.data.accountId);
      console.log('cafeId:', job.data.cafeId);
      console.log('keyword:', job.data.keyword);
      console.log('skipComments:', job.data.skipComments);
      console.log('viralComments:', job.data.viralComments ? `YES (${job.data.viralComments.comments?.length || 0}개)` : 'NO');
      console.log('commenterAccountIds:', JSON.stringify(job.data.commenterAccountIds));
      console.log('returnvalue:', JSON.stringify(job.returnvalue));
      console.log('processedOn:', job.processedOn ? new Date(job.processedOn).toLocaleString('ko-KR') : '?');
    }

    await queue.close();
  }

  await redis.quit();
  process.exit(0);
};
run().catch(console.error);
