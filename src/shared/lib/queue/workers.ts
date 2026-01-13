import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../redis';
import {
  TaskJobData,
  GenerateJobData,
  JobResult,
  getTaskQueueName,
  GENERATE_QUEUE_NAME,
  PostJobData,
  CommentJobData,
  ReplyJobData,
} from './types';
import { addTaskJob } from './index';
import { writePostWithAccount } from '@/features/auto-comment/batch/post-writer';
import {
  writeCommentWithAccount,
  writeReplyWithAccount,
} from '@/features/auto-comment/comment-writer';
import { generateComment, generateReply, generateAuthorReply } from '@/shared/api/comment-gen-api';
import { getAllAccounts } from '@/shared/config/accounts';
import { isAccountActive, getPersonaIndex, NaverAccount } from '@/shared/lib/account-manager';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle, incrementTodayPostCount } from '@/shared/models';
import mongoose from 'mongoose';
import { getRandomCommentCount } from '@/features/auto-comment/batch/random';

// 계정별 워커 캐시
const taskWorkers: Map<string, Worker<TaskJobData, JobResult>> = new Map();

// Generate 워커 (싱글톤)
let generateWorker: Worker<GenerateJobData, JobResult> | null = null;

// Task Job 처리
const processTaskJob = async (job: Job<TaskJobData, JobResult>): Promise<JobResult> => {
  const { data } = job;
  const settings = await getQueueSettings();

  console.log(`[WORKER] 처리 시작: ${data.type} (${data.accountId})`);

  const accounts = getAllAccounts();
  const account = accounts.find((a) => a.id === data.accountId);

  if (!account) {
    return { success: false, error: `계정 없음: ${data.accountId}` };
  }

  // 활동 시간대 체크 (비활동 시간에는 작업 스킵)
  if (!isAccountActive(account)) {
    console.log(`[WORKER] 비활동 시간 - 작업 스킵: ${data.accountId}`);
    return { success: false, error: '비활동 시간대' };
  }

  try {
    switch (data.type) {
      case 'post': {
        const postData = data as PostJobData;
        const result = await Promise.race([
          writePostWithAccount(account, {
            cafeId: postData.cafeId,
            menuId: postData.menuId,
            subject: postData.subject,
            content: postData.content,
            category: postData.category,
            postOptions: postData.postOptions,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
          ),
        ]);

        // 글 발행 성공 시 체인 작업 추가 (skipComments가 아닌 경우에만)
        if (result.success && result.articleId && !postData.skipComments) {
          await handlePostSuccess(postData, result.articleId, accounts, settings);
        } else if (result.success && result.articleId && postData.skipComments) {
          // 글만 발행 모드: 원고만 저장
          await saveArticleOnly(postData, result.articleId);
        }

        return {
          success: result.success,
          error: result.error,
          articleId: result.articleId,
          articleUrl: result.articleUrl,
        };
      }

      case 'comment': {
        const commentData = data as CommentJobData;
        const result = await Promise.race([
          writeCommentWithAccount(
            account,
            commentData.cafeId,
            commentData.articleId,
            commentData.content
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
          ),
        ]);

        return { success: result.success, error: result.error };
      }

      case 'reply': {
        const replyData = data as ReplyJobData;
        const result = await Promise.race([
          writeReplyWithAccount(
            account,
            replyData.cafeId,
            replyData.articleId,
            replyData.content,
            replyData.commentIndex
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
          ),
        ]);

        return { success: result.success, error: result.error };
      }

      default:
        return { success: false, error: '알 수 없는 작업 타입' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[WORKER] 에러: ${data.type} (${data.accountId})`, errorMessage);
    return { success: false, error: errorMessage };
  }
};

// 계정별 Task 워커 생성
export const createTaskWorker = (accountId: string): Worker<TaskJobData, JobResult> => {
  const queueName = getTaskQueueName(accountId);

  if (taskWorkers.has(accountId)) {
    return taskWorkers.get(accountId)!;
  }

  const worker = new Worker<TaskJobData, JobResult>(queueName, processTaskJob, {
    connection: getRedisConnection(),
    concurrency: 1, // 계정당 1개씩만 처리 (브라우저 세션 충돌 방지)
  });

  worker.on('completed', (job, result) => {
    console.log(`[WORKER] 완료: ${job.name} (${accountId})`, result.success ? '성공' : '실패');
  });

  worker.on('failed', (job, err) => {
    console.error(`[WORKER] 실패: ${job?.name} (${accountId})`, err.message);
  });

  taskWorkers.set(accountId, worker);
  console.log(`[WORKER] Task 워커 생성: ${accountId}`);

  return worker;
};

// Generate 워커 생성 (AI 콘텐츠 생성)
export const createGenerateWorker = (
  processGenerate: (job: Job<GenerateJobData>) => Promise<JobResult>
): Worker<GenerateJobData, JobResult> => {
  if (generateWorker) {
    return generateWorker;
  }

  generateWorker = new Worker<GenerateJobData, JobResult>(GENERATE_QUEUE_NAME, processGenerate, {
    connection: getRedisConnection(),
    concurrency: 3, // AI 생성은 병렬 가능
  });

  generateWorker.on('completed', (job, result) => {
    console.log(`[WORKER] Generate 완료: ${job.data.keyword}`, result.success ? '성공' : '실패');
  });

  generateWorker.on('failed', (job, err) => {
    console.error(`[WORKER] Generate 실패: ${job?.data.keyword}`, err.message);
  });

  console.log('[WORKER] Generate 워커 생성');

  return generateWorker;
};

// 모든 워커 종료
export const closeAllWorkers = async (): Promise<void> => {
  for (const [accountId, worker] of taskWorkers) {
    await worker.close();
    console.log(`[WORKER] Task 워커 종료: ${accountId}`);
  }
  taskWorkers.clear();

  if (generateWorker) {
    await generateWorker.close();
    generateWorker = null;
    console.log('[WORKER] Generate 워커 종료');
  }
};

// 모든 등록된 계정에 대해 워커 시작
export const startAllTaskWorkers = (): void => {
  const accounts = getAllAccounts();

  for (const account of accounts) {
    createTaskWorker(account.id);
  }

  console.log(`[WORKER] ${accounts.length}개 계정 워커 시작됨`);
};

// 글만 발행 모드: 원고만 저장 (댓글/대댓글 없음)
const saveArticleOnly = async (postData: PostJobData, articleId: number): Promise<void> => {
  const { cafeId, menuId, keyword, subject, content, accountId: writerAccountId } = postData;

  console.log(`[WORKER] 글만 발행 모드: #${articleId} - 원고 저장`);

  try {
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;
      await PublishedArticle.create({
        articleId,
        cafeId,
        menuId,
        keyword: keyword || '',
        title: subject,
        content,
        articleUrl,
        writerAccountId,
        status: 'published',
        commentCount: 0,
        replyCount: 0,
      });

      // 일일 포스트 카운트 증가
      await incrementTodayPostCount(writerAccountId);
      console.log(`[WORKER] 원고 저장 완료 (글만 발행): #${articleId}`);
    }
  } catch (dbError) {
    console.error('[WORKER] 원고 저장 실패:', dbError);
  }
};

// 글 발행 성공 후 처리 (원고 저장 + 댓글/대댓글 job 추가)
const handlePostSuccess = async (
  postData: PostJobData,
  articleId: number,
  accounts: ReturnType<typeof getAllAccounts>,
  settings: Awaited<ReturnType<typeof getQueueSettings>>
): Promise<void> => {
  const { cafeId, menuId, keyword, subject, content, rawContent, accountId: writerAccountId } = postData;

  console.log(`[WORKER] 글 발행 성공: #${articleId} - 체인 작업 시작`);

  // 1. 원고 MongoDB 저장 + 일일 포스트 카운트 증가
  try {
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;
      await PublishedArticle.create({
        articleId,
        cafeId,
        menuId,
        keyword: keyword || '',
        title: subject,
        content,
        articleUrl,
        writerAccountId,
        status: 'published',
        commentCount: 0,
        replyCount: 0,
      });

      // 일일 포스트 카운트 증가
      await incrementTodayPostCount(writerAccountId);
      console.log(`[WORKER] 원고 저장 완료: #${articleId}`);
    }
  } catch (dbError) {
    console.error('[WORKER] 원고 저장 실패:', dbError);
  }

  // 2. 댓글 job 추가 (글쓴이 제외한 활동 가능한 계정만)
  const commenterAccounts = accounts.filter((a) => a.id !== writerAccountId && isAccountActive(a));
  if (commenterAccounts.length === 0) {
    console.log('[WORKER] 활동 가능한 댓글 계정 없음 - 스킵');
    return;
  }

  const commentCount = getRandomCommentCount(); // 5~10개
  const postContent = rawContent || content;

  // 계정별 댓글 딜레이 추적
  const commentDelays: Map<string, number> = new Map();
  const afterPostDelay = getRandomDelay(settings.delays.afterPost);

  console.log(`[WORKER] 댓글 ${commentCount}개 job 추가 예정`);

  // 댓글 작성자 추적 (자기 댓글에 대댓글 방지용)
  const commentAuthors: string[] = [];

  // 댓글 AI 생성 및 job 추가
  for (let i = 0; i < commentCount; i++) {
    const commenter = commenterAccounts[i % commenterAccounts.length];
    const personaIndex = getPersonaIndex(commenter);

    // AI로 댓글 생성 (계정별 페르소나 적용)
    let commentText: string;
    try {
      commentText = await generateComment(postContent, personaIndex);
    } catch {
      commentText = '좋은 정보 감사합니다!';
    }

    // 해당 계정의 현재 딜레이 가져오기
    const currentDelay = commentDelays.get(commenter.id) ?? afterPostDelay;
    const nextDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
    commentDelays.set(commenter.id, nextDelay);

    const commentJobData: CommentJobData = {
      type: 'comment',
      accountId: commenter.id,
      cafeId,
      articleId,
      content: commentText,
    };

    await addTaskJob(commenter.id, commentJobData, currentDelay);
    console.log(`[WORKER] 댓글 job 추가: ${commenter.id}, 딜레이: ${Math.round(currentDelay / 1000)}초`);

    // 댓글 작성자 기록
    commentAuthors.push(commenter.id);
  }

  // 3. 대댓글 job 추가 (글쓴이 + 다른 계정)
  // 글쓴이 대댓글: 2~3개
  const authorReplyCount = Math.floor(Math.random() * 2) + 2;
  // 일반 대댓글: 2~4개
  const normalReplyCount = Math.floor(Math.random() * 3) + 2;
  const totalReplyCount = authorReplyCount + normalReplyCount;

  console.log(`[WORKER] 대댓글 ${totalReplyCount}개 job 추가 예정 (글쓴이: ${authorReplyCount}, 일반: ${normalReplyCount})`);

  // 대댓글은 모든 댓글 이후에 시작
  const maxCommentDelay = Math.max(...Array.from(commentDelays.values()), afterPostDelay);
  const replyBaseDelay = maxCommentDelay + getRandomDelay(settings.delays.afterPost);

  const replyDelays: Map<string, number> = new Map();

  // 글쓴이 대댓글
  const writerAccount = accounts.find((a) => a.id === writerAccountId);
  if (writerAccount && isAccountActive(writerAccount)) {
    const writerPersonaIndex = getPersonaIndex(writerAccount);
    for (let i = 0; i < authorReplyCount; i++) {
      const targetCommentIndex = i % commentCount;

      let replyText: string;
      try {
        replyText = await generateAuthorReply(postContent, '댓글 감사합니다', writerPersonaIndex);
      } catch {
        replyText = '댓글 감사합니다!';
      }

      const currentDelay = replyDelays.get(writerAccountId) ?? replyBaseDelay;
      const nextDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
      replyDelays.set(writerAccountId, nextDelay);

      const replyJobData: ReplyJobData = {
        type: 'reply',
        accountId: writerAccountId,
        cafeId,
        articleId,
        content: replyText,
        commentIndex: targetCommentIndex,
      };

      await addTaskJob(writerAccountId, replyJobData, currentDelay);
      console.log(`[WORKER] 글쓴이 대댓글 job 추가: ${writerAccountId}, 딜레이: ${Math.round(currentDelay / 1000)}초`);
    }
  }

  // 일반 대댓글 (활동 가능한 계정만, 자기 댓글에 대댓글 방지)
  for (let i = 0; i < normalReplyCount; i++) {
    const targetCommentIndex = (authorReplyCount + i) % commentCount;
    const commentAuthorId = commentAuthors[targetCommentIndex];

    // 자기 댓글에 대댓글 달지 않도록 다른 계정 선택
    let replyer = commenterAccounts[(authorReplyCount + i) % commenterAccounts.length];

    if (replyer.id === commentAuthorId) {
      // 다른 계정으로 변경
      const alternativeReplyer = commenterAccounts.find(
        (a) => a.id !== commentAuthorId
      );
      if (alternativeReplyer) {
        replyer = alternativeReplyer;
      } else {
        // 대체 계정이 없으면 스킵
        console.log(`[WORKER] 일반 대댓글 ${i} - 자기 댓글에 대댓글 방지로 스킵`);
        continue;
      }
    }

    const replyerPersonaIndex = getPersonaIndex(replyer);

    let replyText: string;
    try {
      replyText = await generateReply(postContent, '좋은 정보네요', replyerPersonaIndex);
    } catch {
      replyText = '저도 그렇게 생각해요!';
    }

    const currentDelay = replyDelays.get(replyer.id) ?? replyBaseDelay;
    const nextDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
    replyDelays.set(replyer.id, nextDelay);

    const replyJobData: ReplyJobData = {
      type: 'reply',
      accountId: replyer.id,
      cafeId,
      articleId,
      content: replyText,
      commentIndex: targetCommentIndex,
    };

    await addTaskJob(replyer.id, replyJobData, currentDelay);
    console.log(`[WORKER] 일반 대댓글 job 추가: ${replyer.id} → 댓글[${targetCommentIndex}], 딜레이: ${Math.round(currentDelay / 1000)}초`);
  }

  console.log(`[WORKER] 체인 작업 완료: 댓글 ${commentCount}개, 대댓글 ${totalReplyCount}개 job 추가됨`);
};
