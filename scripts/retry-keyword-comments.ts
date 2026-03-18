import { Queue } from 'bullmq';
import Redis from 'ioredis';
import mongoose from 'mongoose';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cafe-bot';
const EXCLUDE_ACCOUNT = 'loand3324';

const TARGETS = [
  { keyword: '생리주기 불규칙', articleId: 620 },
  { keyword: '난임 한약 비용', articleId: 0 }, // articleId 0이면 큐에서 찾기
];

const run = async () => {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await mongoose.connect(MONGODB_URI);
  console.log('[MongoDB] 연결 완료');

  const { PublishedArticle } = await import('../src/shared/models/published-article');

  // 1. 모든 write lock 클리어
  const allLocks = await redis.keys('write_lock:*');
  if (allLocks.length > 0) {
    await redis.del(...allLocks);
    console.log(`[Redis] write lock ${allLocks.length}개 전부 클리어`);
  }

  // 2. 큐에서 completed/failed 댓글/대댓글 잡 수집
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  interface FoundJob {
    queueName: string;
    job: any;
    keyword: string;
  }
  const jobsToRetry: FoundJob[] = [];

  for (const queueName of queueNames) {
    const queue = new Queue(queueName, { connection: redis });

    for (const status of ['completed', 'failed'] as const) {
      const jobs = status === 'completed'
        ? await queue.getCompleted(0, 500)
        : await queue.getFailed(0, 500);

      for (const job of jobs) {
        const kw = job.data?.keyword || '';
        const subject = job.data?.subject || '';
        const type = job.data?.type;

        if (type === 'post') continue;
        if (job.data?.accountId === EXCLUDE_ACCOUNT) continue;

        for (const target of TARGETS) {
          if (kw.indexOf(target.keyword) !== -1 || subject.indexOf(target.keyword) !== -1) {
            jobsToRetry.push({ queueName, job, keyword: target.keyword });
            break;
          }
        }
      }
    }
    await queue.close();
  }

  console.log(`\n재시작 대상: ${jobsToRetry.length}개 (${EXCLUDE_ACCOUNT} 제외)\n`);

  // 3. MongoDB 댓글 기록 클리어 (대상 article만)
  for (const target of TARGETS) {
    if (target.articleId > 0) {
      const article = await PublishedArticle.findOne({ articleId: target.articleId });
      if (article) {
        console.log(`[DB] article #${target.articleId} 댓글 기록 클리어`);
        await PublishedArticle.updateOne(
          { articleId: target.articleId },
          { $set: { comments: [], commentCount: 0, replyCount: 0 } }
        );
      }
    }
  }

  // 4. 댓글 먼저, 대댓글 나중 — 1~3분 간격 딜레이
  const comments = jobsToRetry.filter(({ job }) => job.data.type === 'comment');
  const replies = jobsToRetry.filter(({ job }) => job.data.type === 'reply');
  const ordered = [...comments, ...replies];

  let cumulativeDelay = 0;
  let requeued = 0;

  for (const { queueName, job } of ordered) {
    const d = job.data;
    const queue = new Queue(queueName, { connection: redis });

    const { sequenceId, sequenceIndex, _retryCount, rescheduleToken, ...cleanData } = d;
    const token = `retry2_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newData = { ...cleanData, rescheduleToken: token };

    const delay = cumulativeDelay + (60 + Math.floor(Math.random() * 120)) * 1000;
    cumulativeDelay = delay;

    const contentHash = (newData.content || '').slice(0, 8).replace(/\s+/g, '');
    const jobId = d.type === 'reply'
      ? `reply_${d.accountId}_${d.articleId}_${d.commentIndex}_${contentHash}_r${token}`
      : `comment_${d.accountId}_${d.articleId}_${contentHash}_r${token}`;

    await queue.add(d.type, newData, { delay, jobId });
    console.log(`[+] ${d.type} ${d.accountId} (${d.keyword}) → ${Math.round(delay / 1000)}초 후`);
    requeued++;

    try { await job.remove(); } catch {}
    await queue.close();
  }

  console.log(`\n총 ${requeued}개 작업 재시작 (${EXCLUDE_ACCOUNT} 제외, 1~3분 간격)`);

  await mongoose.disconnect();
  await redis.quit();
  process.exit(0);
};

run().catch(console.error);
