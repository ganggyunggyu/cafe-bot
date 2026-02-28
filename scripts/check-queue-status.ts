import mongoose from 'mongoose';
import { QueueSettings } from '../src/shared/models/queue-settings';
import { connectDB } from '../src/shared/lib/mongodb';
import Redis from 'ioredis';

const MONGODB_URI = process.env.MONGODB_URI!;

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  // 1. QueueSettings 현재 값
  const settings = await QueueSettings.findOne().lean();
  console.log('=== QueueSettings ===');
  console.log('afterPost:', JSON.stringify(settings?.delays?.afterPost));
  console.log('betweenComments:', JSON.stringify(settings?.delays?.betweenComments));

  // 2. Redis 큐 상태
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  const waiting = await redis.llen('bull:task-queue:wait');
  const delayed = await redis.zcard('bull:task-queue:delayed');
  const active = await redis.llen('bull:task-queue:active');
  const completed = await redis.zcard('bull:task-queue:completed');

  console.log('\n=== Queue Status ===');
  console.log(`waiting: ${waiting}, delayed: ${delayed}, active: ${active}, completed: ${completed}`);

  // 3. delayed job 샘플
  const delayedJobs = await redis.zrangebyscore(
    'bull:task-queue:delayed', '-inf', '+inf', 'WITHSCORES', 'LIMIT', '0', '15'
  );

  console.log('\n=== Delayed Jobs (다음 15개) ===');
  for (let i = 0; i < delayedJobs.length; i += 2) {
    const jobId = delayedJobs[i];
    const score = parseInt(delayedJobs[i + 1]);
    const execAt = new Date(score);
    const jobData = await redis.hget(`bull:task-queue:${jobId}`, 'data');
    if (jobData) {
      const parsed = JSON.parse(jobData);
      const now = Date.now();
      const minLeft = Math.round((score - now) / 60000);
      console.log(`  [${jobId}] ${parsed.type} ${parsed.accountId} → ${execAt.toLocaleTimeString('ko-KR')} (${minLeft}분 후)${parsed.articleId ? ` #${parsed.articleId}` : ''}${parsed.keyword ? ` "${parsed.keyword}"` : ''}`);
    }
  }

  // 4. 최근 완료 job (comment 타입만)
  const allCompleted = await redis.zrangebyscore(
    'bull:task-queue:completed', '-inf', '+inf', 'WITHSCORES'
  );

  const commentJobs: Array<{ jobId: string; ts: number; data: any }> = [];
  for (let i = 0; i < allCompleted.length; i += 2) {
    const jobId = allCompleted[i];
    const ts = parseInt(allCompleted[i + 1]);
    const jobData = await redis.hget(`bull:task-queue:${jobId}`, 'data');
    if (jobData) {
      const parsed = JSON.parse(jobData);
      if (parsed.type === 'comment') {
        commentJobs.push({ jobId, ts, data: parsed });
      }
    }
  }

  commentJobs.sort((a, b) => a.ts - b.ts);
  console.log(`\n=== 완료된 댓글 Jobs (${commentJobs.length}개) ===`);
  for (const job of commentJobs.slice(-20)) {
    const at = new Date(job.ts);
    console.log(`  [${job.jobId}] ${job.data.accountId} #${job.data.articleId} "${job.data.content?.slice(0, 25)}..." @ ${at.toLocaleTimeString('ko-KR')}`);
  }

  // 5. 같은 articleId + accountId 중복 체크
  const dupeMap = new Map<string, number>();
  for (const job of commentJobs) {
    const key = `${job.data.accountId}:#${job.data.articleId}`;
    dupeMap.set(key, (dupeMap.get(key) || 0) + 1);
  }
  const dupes = [...dupeMap.entries()].filter(([, count]) => count > 1);
  if (dupes.length > 0) {
    console.log('\n=== ⚠️ 중복 댓글 발견 ===');
    for (const [key, count] of dupes) {
      console.log(`  ${key}: ${count}회`);
    }
  } else {
    console.log('\n=== 중복 댓글 없음 ✅ ===');
  }

  await redis.quit();
  await mongoose.disconnect();
};

main().catch((e) => { console.error(e); process.exit(1); });
