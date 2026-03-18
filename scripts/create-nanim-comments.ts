import { Queue } from 'bullmq';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
const ARTICLE_ID = 30624;
const CAFE_ID = '25636798';
const EXCLUDE_ACCOUNT = 'loand3324';
const KEYWORD = '난임 한약 비용';

const run = async () => {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  // 1. 포스트 잡에서 viralComments 추출
  const keys = await redis.keys('bull:task_*:id');
  const queueNames = [...new Set(keys.map((k) => k.split(':')[1]))];

  let postJob: any = null;

  for (const qn of queueNames) {
    const queue = new Queue(qn, { connection: redis });
    const completed = await queue.getCompleted(0, 500);
    for (const job of completed) {
      const kw = job.data?.keyword || '';
      if (kw.indexOf(KEYWORD) !== -1 && job.data?.type === 'post') {
        postJob = job;
        break;
      }
    }
    await queue.close();
    if (postJob) break;
  }

  if (!postJob) {
    console.error('난임 한약 비용 post 잡을 찾을 수 없음');
    await redis.quit();
    process.exit(1);
  }

  const { viralComments, commenterAccountIds, accountId: writerAccountId } = postJob.data;
  if (!viralComments?.comments?.length) {
    console.error('viralComments 데이터 없음');
    await redis.quit();
    process.exit(1);
  }

  const allComments = viralComments.comments;
  console.log(`viralComments: ${allComments.length}개, writer: ${writerAccountId}`);

  // 2. 사용 가능한 commenter 계정 필터링
  const availableIds = (commenterAccountIds || []).filter(
    (id: string) => id !== EXCLUDE_ACCOUNT && id !== writerAccountId
  );
  console.log(`사용 계정: ${availableIds.length}개 (${EXCLUDE_ACCOUNT}, ${writerAccountId} 제외)`);

  // 3. 메인 댓글과 대댓글 분리
  const mainComments = allComments.filter((c: any) => c.type === 'comment');
  const replies = allComments.filter((c: any) => c.type !== 'comment');

  // 댓글 작성자 배정
  const commentAuthorMap = new Map<number, string>();
  mainComments.forEach((c: any, i: number) => {
    const accountId = availableIds[i % availableIds.length];
    commentAuthorMap.set(c.index, accountId);
  });

  const sequenceId = `viral_nanim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  let orderIndex = 0;
  let cumulativeDelay = 30 * 1000; // 첫 댓글 30초 후
  let commentCount = 0;
  let replyCount = 0;

  // 4. 댓글 잡 생성
  for (const item of mainComments) {
    const accountId = commentAuthorMap.get(item.index);
    if (!accountId) continue;

    const queueName = `task_${accountId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const queue = new Queue(queueName, { connection: redis });
    const token = `nanim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const jobData = {
      type: 'comment' as const,
      accountId,
      cafeId: CAFE_ID,
      articleId: ARTICLE_ID,
      content: item.content,
      commentIndex: orderIndex,
      keyword: KEYWORD,
      rescheduleToken: token,
    };

    const jobId = `comment_${accountId}_${ARTICLE_ID}_${item.content.slice(0, 8).replace(/\s+/g, '')}_r${token}`;
    await queue.add('comment', jobData, { delay: cumulativeDelay, jobId });
    console.log(`[+] 댓글 ${accountId} → ${Math.round(cumulativeDelay / 1000)}초 후`);

    commentCount++;
    orderIndex++;
    cumulativeDelay += (60 + Math.floor(Math.random() * 120)) * 1000;
    await queue.close();
  }

  // 5. 대댓글 잡 생성
  for (const item of replies) {
    if (item.parentIndex === undefined) continue;

    const parentAccountId = commentAuthorMap.get(item.parentIndex);
    let accountId: string;

    if (item.type === 'author_reply') {
      accountId = writerAccountId;
    } else if (item.type === 'commenter_reply') {
      accountId = parentAccountId || availableIds[0];
    } else {
      // other_reply: 부모 댓글 작성자가 아닌 다른 계정
      const others = availableIds.filter((id: string) => id !== parentAccountId);
      accountId = others[Math.floor(Math.random() * others.length)] || availableIds[0];
    }

    if (accountId === EXCLUDE_ACCOUNT) continue;

    const parentCommentIndex = Array.from(commentAuthorMap.keys()).indexOf(item.parentIndex);
    const parentContent = mainComments.find((c: any) => c.index === item.parentIndex)?.content;

    const queueName = `task_${accountId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const queue = new Queue(queueName, { connection: redis });
    const token = `nanim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const jobData = {
      type: 'reply' as const,
      accountId,
      cafeId: CAFE_ID,
      articleId: ARTICLE_ID,
      content: item.content,
      commentIndex: parentCommentIndex >= 0 ? parentCommentIndex : 0,
      parentComment: parentContent,
      keyword: KEYWORD,
      rescheduleToken: token,
    };

    const jobId = `reply_${accountId}_${ARTICLE_ID}_${jobData.commentIndex}_${item.content.slice(0, 8).replace(/\s+/g, '')}_r${token}`;
    await queue.add('reply', jobData, { delay: cumulativeDelay, jobId });
    console.log(`[+] 대댓글(${item.type}) ${accountId} → ${Math.round(cumulativeDelay / 1000)}초 후`);

    replyCount++;
    orderIndex++;
    cumulativeDelay += (60 + Math.floor(Math.random() * 120)) * 1000;
    await queue.close();
  }

  console.log(`\n완료: 댓글 ${commentCount}개 + 대댓글 ${replyCount}개 큐 추가 (${EXCLUDE_ACCOUNT} 제외)`);

  await redis.quit();
  process.exit(0);
};

run().catch(console.error);
