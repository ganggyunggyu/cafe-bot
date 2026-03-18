import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const EXCLUDE = 'loand3324';

const targets = [
  { keyword: '비타민영양제', articleId: 11128019, writer: 'dyulp' },
  { keyword: '생리빈혈', articleId: 11128210, writer: 'lesyt' },
];

const run = async () => {
  const redis = new Redis('redis://localhost:6379/1', { maxRetriesPerRequest: null });
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  for (const target of targets) {
    console.log(`\n=== ${target.keyword} (#${target.articleId}) 댓글 큐 생성 ===`);

    let postJob: any = null;
    for (const qn of queueNames) {
      const queue = new Queue(qn, { connection: redis });
      const completed = await queue.getCompleted(0, 500);
      for (const job of completed) {
        if (job.data?.type === 'post' && job.data?.keyword === target.keyword && job.data?.accountId === target.writer) {
          postJob = job;
          break;
        }
      }
      await queue.close();
      if (postJob) break;
    }

    if (!postJob || !postJob.data.viralComments?.comments?.length) {
      console.log('viralComments 없음 - 스킵');
      continue;
    }

    const { viralComments, commenterAccountIds, accountId: writerAccountId, cafeId } = postJob.data;
    const availableIds = (commenterAccountIds || []).filter(
      (id: string) => id !== EXCLUDE && id !== writerAccountId
    );
    const allComments = viralComments.comments;
    const mainComments = allComments.filter((c: any) => c.type === 'comment');
    const replies = allComments.filter((c: any) => c.type !== 'comment');

    const commentAuthorMap = new Map<number, string>();
    mainComments.forEach((c: any, i: number) => {
      commentAuthorMap.set(c.index, availableIds[i % availableIds.length]);
    });

    let cumulativeDelay = 30 * 1000;
    let commentCount = 0;
    let replyCount = 0;
    let orderIndex = 0;

    for (const item of mainComments) {
      const accountId = commentAuthorMap.get(item.index);
      if (!accountId) continue;
      const queueName = `task_${accountId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const queue = new Queue(queueName, { connection: redis });
      const token = `fix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const jobData = {
        type: 'comment' as const,
        accountId,
        cafeId,
        articleId: target.articleId,
        content: item.content,
        commentIndex: orderIndex,
        keyword: target.keyword,
        rescheduleToken: token,
      };
      const contentHash = (item.content || '').slice(0, 8).replace(/\s+/g, '');
      const jobId = `comment_${accountId}_${target.articleId}_${contentHash}_r${token}`;
      await queue.add('comment', jobData, { delay: cumulativeDelay, jobId });
      console.log(`[+] 댓글 ${accountId} → ${Math.round(cumulativeDelay / 1000)}초 후`);
      commentCount++;
      orderIndex++;
      cumulativeDelay += (60 + Math.floor(Math.random() * 120)) * 1000;
      await queue.close();
    }

    for (const item of replies) {
      if (item.parentIndex === undefined) continue;
      const parentAccountId = commentAuthorMap.get(item.parentIndex);
      let accountId: string;

      if (item.type === 'author_reply') {
        accountId = writerAccountId;
      } else if (item.type === 'commenter_reply') {
        accountId = parentAccountId || availableIds[0];
      } else {
        const others = availableIds.filter((id: string) => id !== parentAccountId);
        accountId = others[Math.floor(Math.random() * others.length)] || availableIds[0];
      }

      if (accountId === EXCLUDE) continue;

      const parentCommentIndex = Array.from(commentAuthorMap.keys()).indexOf(item.parentIndex);
      const parentContent = mainComments.find((c: any) => c.index === item.parentIndex)?.content;
      const queueName = `task_${accountId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const queue = new Queue(queueName, { connection: redis });
      const token = `fix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const jobData = {
        type: 'reply' as const,
        accountId,
        cafeId,
        articleId: target.articleId,
        content: item.content,
        commentIndex: parentCommentIndex >= 0 ? parentCommentIndex : 0,
        parentComment: parentContent,
        keyword: target.keyword,
        rescheduleToken: token,
      };
      const contentHash = (item.content || '').slice(0, 8).replace(/\s+/g, '');
      const jobId = `reply_${accountId}_${target.articleId}_${jobData.commentIndex}_${contentHash}_r${token}`;
      await queue.add('reply', jobData, { delay: cumulativeDelay, jobId });
      console.log(`[+] 답글(${item.type}) ${accountId} → ${Math.round(cumulativeDelay / 1000)}초 후`);
      replyCount++;
      orderIndex++;
      cumulativeDelay += (60 + Math.floor(Math.random() * 120)) * 1000;
      await queue.close();
    }

    console.log(`완료: 댓글 ${commentCount}개 + 답글 ${replyCount}개 (총 ~${Math.round(cumulativeDelay / 60000)}분 소요 예정)`);
  }

  await redis.quit();
  process.exit(0);
};

run().catch(console.error);
