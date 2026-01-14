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
import { isAccountActive, getPersonaId, getNextActiveTime, NaverAccount } from '@/shared/lib/account-manager';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle, incrementTodayPostCount, addCommentToArticle, hasCommented } from '@/shared/models';
import mongoose from 'mongoose';

// 계정별 워커 캐시
const taskWorkers: Map<string, Worker<TaskJobData, JobResult>> = new Map();

// Generate 워커 (싱글톤)
let generateWorker: Worker<GenerateJobData, JobResult> | null = null;

// Task Job 처리
const processTaskJob = async (job: Job<TaskJobData, JobResult>): Promise<JobResult> => {
  const { data } = job;
  const settings = await getQueueSettings();

  console.log(`[WORKER] 처리 시작: ${data.type} (${data.accountId})`);

  const accounts = await getAllAccounts();
  const account = accounts.find((a) => a.id === data.accountId);

  if (!account) {
    return { success: false, error: `계정 없음: ${data.accountId}` };
  }

  // 활동 시간대 체크 (비활동 시간에는 활동 시간까지 reschedule)
  if (!isAccountActive(account)) {
    const nextActiveDelay = getNextActiveTime(account);
    console.log(`[WORKER] 비활동 시간 - ${Math.round(nextActiveDelay / 60000)}분 뒤 재스케줄: ${data.accountId}`);
    await addTaskJob(data.accountId, data, nextActiveDelay);
    return { success: false, error: '비활동 시간대 - 재스케줄됨', willRetry: true };
  }

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

      // 실패 시 에러 throw (BullMQ가 재시도/실패 처리)
      if (!result.success) {
        throw new Error(result.error || '글 작성 실패');
      }

      // 글 발행 성공! 이후 MongoDB 에러가 발생해도 Job을 재시도하면 안 됨
      // (재시도하면 글이 또 발행됨)
      try {
        if (result.articleId && !postData.skipComments) {
          await handlePostSuccess(postData, result.articleId, accounts, settings);
        } else if (result.articleId && postData.skipComments) {
          await saveArticleOnly(postData, result.articleId);
        }
      } catch (chainError) {
        // MongoDB 저장 실패 등은 로그만 남기고 Job은 성공으로 처리
        console.error('[WORKER] 체인 작업 중 오류 (글 발행은 완료됨):', chainError);
      }

      return {
        success: true,
        articleId: result.articleId,
        articleUrl: result.articleUrl,
      };
    }

    case 'comment': {
      const commentData = data as CommentJobData;

      // 중복 체크: 이미 이 계정으로 댓글 달았으면 스킵
      const alreadyCommented = await hasCommented(
        commentData.cafeId,
        commentData.articleId,
        account.id,
        'comment'
      );
      if (alreadyCommented) {
        console.log(`[WORKER] 중복 댓글 스킵: ${account.id} → #${commentData.articleId}`);
        return { success: true }; // 성공으로 처리 (재시도 방지)
      }

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

      // ARTICLE_NOT_READY 에러: 5분 뒤 재시도
      if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
        const retryDelay = 5 * 60 * 1000; // 5분
        console.log(`[WORKER] 글 미준비 - 5분 뒤 재시도: ${commentData.articleId}`);
        await addTaskJob(data.accountId, commentData, retryDelay);
        return { success: false, error: result.error, willRetry: true };
      }

      // 다른 실패는 에러 throw (BullMQ가 재시도/실패 처리)
      if (!result.success) {
        throw new Error(result.error || '댓글 작성 실패');
      }

      // DB에 댓글 기록 저장
      try {
        await addCommentToArticle(commentData.cafeId, commentData.articleId, {
          accountId: account.id,
          nickname: account.nickname || account.id,
          content: commentData.content,
          type: 'comment',
        });
      } catch (dbErr) {
        console.error('[WORKER] 댓글 DB 저장 실패:', dbErr);
      }

      return { success: true };
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

      // ARTICLE_NOT_READY 에러: 5분 뒤 재시도
      if (!result.success && result.error?.startsWith('ARTICLE_NOT_READY:')) {
        const retryDelay = 5 * 60 * 1000; // 5분
        console.log(`[WORKER] 글/댓글 미준비 - 5분 뒤 재시도: ${replyData.articleId}`);
        await addTaskJob(data.accountId, replyData, retryDelay);
        return { success: false, error: result.error, willRetry: true };
      }

      // 다른 실패는 에러 throw (BullMQ가 재시도/실패 처리)
      if (!result.success) {
        throw new Error(result.error || '대댓글 작성 실패');
      }

      // DB에 대댓글 기록 저장
      try {
        await addCommentToArticle(replyData.cafeId, replyData.articleId, {
          accountId: account.id,
          nickname: account.nickname || account.id,
          content: replyData.content,
          type: 'reply',
          parentIndex: replyData.commentIndex,
        });
      } catch (dbErr) {
        console.error('[WORKER] 대댓글 DB 저장 실패:', dbErr);
      }

      return { success: true };
    }

    default:
      throw new Error('알 수 없는 작업 타입');
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
export const startAllTaskWorkers = async (): Promise<void> => {
  const accounts = await getAllAccounts();

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
  accounts: NaverAccount[],
  settings: Awaited<ReturnType<typeof getQueueSettings>>
): Promise<void> => {
  const { cafeId, menuId, keyword, subject, content, rawContent, accountId: writerAccountId } = postData;

  console.log(`[WORKER] 글 발행 성공: #${articleId} - 체인 작업 시작`);

  // 1. 원고 MongoDB 저장 + 일일 포스트 카운트 증가
  try {
    await connectDB();
    console.log(`[WORKER] MongoDB 연결 상태: ${mongoose.connection.readyState}`);
    if (mongoose.connection.readyState === 1) {
      const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;
      const created = await PublishedArticle.create({
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
        comments: [], // 빈 댓글 배열 초기화
      });

      // 일일 포스트 카운트 증가
      await incrementTodayPostCount(writerAccountId);
      console.log(`[WORKER] 원고 저장 완료: #${articleId}, _id=${created._id}`);
    } else {
      console.log(`[WORKER] MongoDB 미연결 - 원고 저장 스킵: #${articleId}`);
    }
  } catch (dbError) {
    console.error('[WORKER] 원고 저장 실패:', dbError);
  }

  // 2. 댓글 job 추가 (글쓴이 제외 - 비활동 계정도 포함, delay로 처리)
  const commenterAccounts = accounts.filter((a) => a.id !== writerAccountId);
  if (commenterAccounts.length === 0) {
    console.log('[WORKER] 댓글 계정 없음 - 스킵');
    return;
  }

  // 글쓴이 계정 정보 (닉네임 전달용)
  const writerAccount = accounts.find((a) => a.id === writerAccountId);
  const writerNickname = writerAccount?.nickname || writerAccountId;

  const postContent = rawContent || content;

  // 계정별 댓글 딜레이 추적
  const commentDelays: Map<string, number> = new Map();
  const afterPostDelay = getRandomDelay(settings.delays.afterPost);

  // 계정당 최대 댓글 수 = 1 (대댓글은 별도)
  const maxCommentsPerAccount = 1;
  // 댓글 수 = 계정 수 (계정당 1개씩)
  const commentCount = commenterAccounts.length;

  console.log(`[WORKER] 댓글 ${commentCount}개 job 추가 예정 (계정당 ${maxCommentsPerAccount}개)`);

  // 댓글 작성자 추적 (자기 댓글에 대댓글 방지용) - {accountId, nickname} 쌍으로 저장
  const commentAuthors: Array<{ id: string; nickname: string }> = [];
  // 계정별 댓글 카운트
  const accountCommentCounts: Map<string, number> = new Map();

  // 댓글 AI 생성 및 job 추가
  for (let i = 0; i < commentCount; i++) {
    // 계정 선택: 라운드 로빈으로 분배 (계정이 적으면 여러 번 댓글 가능)
    const commenter = commenterAccounts[i % commenterAccounts.length];
    const currentCount = accountCommentCounts.get(commenter.id) ?? 0;

    // 계정당 1개까지만 (대댓글은 별도로 제한 없음)
    if (currentCount >= maxCommentsPerAccount) continue;

    const personaId = getPersonaId(commenter);

    // 계정 댓글 카운트 증가
    accountCommentCounts.set(commenter.id, (accountCommentCounts.get(commenter.id) ?? 0) + 1);

    // AI로 댓글 생성 (계정별 페르소나 적용 + 글쓴이 닉네임 전달)
    let commentText: string;
    try {
      commentText = await generateComment(postContent, personaId, writerNickname);
    } catch {
      commentText = '좋은 정보 감사합니다!';
    }

    // 해당 계정의 현재 딜레이 + 활동시간까지 대기 시간
    const baseDelay = commentDelays.get(commenter.id) ?? afterPostDelay;
    const activityDelay = getNextActiveTime(commenter);
    const currentDelay = Math.max(baseDelay, activityDelay);
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
    const delayInfo = activityDelay > 0
      ? `${Math.round(currentDelay / 1000)}초 (활동시간까지 ${Math.round(activityDelay / 60000)}분)`
      : `${Math.round(currentDelay / 1000)}초`;
    console.log(`[WORKER] 댓글 job 추가: ${commenter.id}, 딜레이: ${delayInfo}`);

    // 댓글 작성자 기록 (닉네임 포함)
    const commenterNickname = commenter.nickname || commenter.id;
    commentAuthors.push({ id: commenter.id, nickname: commenterNickname });
  }

  // 3. 대댓글 job 추가 (글쓴이 + 다른 계정)
  const actualCommentCount = commentAuthors.length; // 실제 생성된 댓글 수
  if (actualCommentCount === 0) {
    console.log('[WORKER] 댓글이 없어서 대댓글 스킵');
    return;
  }

  // 글쓴이 대댓글: 1~2개 (댓글 수에 맞게 제한)
  const authorReplyCount = Math.min(Math.floor(Math.random() * 2) + 1, actualCommentCount);
  // 일반 대댓글: 1~2개 (계정 수에 맞게 제한)
  const normalReplyCount = Math.min(
    Math.floor(Math.random() * 2) + 1,
    Math.max(actualCommentCount - authorReplyCount, 0)
  );
  const totalReplyCount = authorReplyCount + normalReplyCount;

  console.log(`[WORKER] 대댓글 ${totalReplyCount}개 job 추가 예정 (글쓴이: ${authorReplyCount}, 일반: ${normalReplyCount})`);

  // 대댓글은 모든 댓글 이후에 시작
  const maxCommentDelay = Math.max(...Array.from(commentDelays.values()), afterPostDelay);
  const replyBaseDelay = maxCommentDelay + getRandomDelay(settings.delays.afterPost);

  const replyDelays: Map<string, number> = new Map();

  // 대댓글 받은 댓글 인덱스 추적 (중복 방지)
  const repliedCommentIndices: Set<number> = new Set();

  // 글쓴이 대댓글 (자기 글에 달린 댓글에 응답 - 자연스러움)
  if (writerAccount) {
    const writerPersonaId = getPersonaId(writerAccount);
    const writerActivityDelay = getNextActiveTime(writerAccount);

    for (let i = 0; i < authorReplyCount; i++) {
      // 아직 대댓글 안 받은 댓글 중에서 선택
      let targetCommentIndex = i % actualCommentCount;
      while (repliedCommentIndices.has(targetCommentIndex) && repliedCommentIndices.size < actualCommentCount) {
        targetCommentIndex = (targetCommentIndex + 1) % actualCommentCount;
      }
      repliedCommentIndices.add(targetCommentIndex);

      // 원댓글 작성자 닉네임 가져오기
      const targetCommentAuthor = commentAuthors[targetCommentIndex];
      const parentAuthorNickname = targetCommentAuthor?.nickname;

      let replyText: string;
      try {
        replyText = await generateAuthorReply(postContent, '댓글 감사합니다', writerPersonaId, parentAuthorNickname, writerNickname);
      } catch {
        replyText = '댓글 감사합니다!';
      }

      const baseDelay = replyDelays.get(writerAccountId) ?? replyBaseDelay;
      const currentDelay = Math.max(baseDelay, writerActivityDelay);
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
      const delayInfo = writerActivityDelay > 0
        ? `${Math.round(currentDelay / 1000)}초 (활동시간까지 ${Math.round(writerActivityDelay / 60000)}분)`
        : `${Math.round(currentDelay / 1000)}초`;
      console.log(`[WORKER] 글쓴이 대댓글 job 추가: ${writerAccountId} → 댓글[${targetCommentIndex}], 딜레이: ${delayInfo}`);
    }
  }

  // 일반 대댓글 (자기 댓글에 대댓글 방지 강화)
  for (let i = 0; i < normalReplyCount; i++) {
    // 아직 대댓글 안 받은 댓글 중에서 선택
    let targetCommentIndex = -1;
    for (let j = 0; j < actualCommentCount; j++) {
      const idx = (i + j) % actualCommentCount;
      if (!repliedCommentIndices.has(idx)) {
        targetCommentIndex = idx;
        break;
      }
    }

    // 모든 댓글에 대댓글이 달렸으면 스킵
    if (targetCommentIndex === -1) {
      console.log(`[WORKER] 일반 대댓글 ${i} - 모든 댓글에 대댓글 있어서 스킵`);
      continue;
    }

    repliedCommentIndices.add(targetCommentIndex);
    const targetCommentAuthor = commentAuthors[targetCommentIndex];

    // 방어 코드: targetCommentAuthor가 없으면 스킵
    if (!targetCommentAuthor?.id) {
      console.log(`[WORKER] 일반 대댓글 ${i} - 댓글 작성자 정보 없음 (index: ${targetCommentIndex})`);
      continue;
    }

    // 자기 댓글에 대댓글 달지 않도록 다른 계정 선택
    console.log(`[WORKER] 대댓글 계정 선택: 댓글[${targetCommentIndex}] 작성자=${targetCommentAuthor.id}, 후보=${commenterAccounts.map(a => a.id).join(',')}`);
    const availableReplyers = commenterAccounts.filter((a) => a.id !== targetCommentAuthor.id);
    if (availableReplyers.length === 0) {
      console.log(`[WORKER] 일반 대댓글 ${i} - 사용 가능한 계정 없어서 스킵 (댓글 작성자: ${targetCommentAuthor.id})`);
      continue;
    }

    const replyer = availableReplyers[i % availableReplyers.length];
    const replyerPersonaId = getPersonaId(replyer);

    const replyerNickname = replyer.nickname || replyer.id;

    let replyText: string;
    try {
      // 글쓴이 닉네임 + 원댓글 작성자 닉네임 + 대댓글 작성자 닉네임 전달
      replyText = await generateReply(
        postContent,
        '좋은 정보네요',
        replyerPersonaId,
        writerNickname,
        targetCommentAuthor.nickname,
        replyerNickname
      );
    } catch {
      replyText = '저도 그렇게 생각해요!';
    }

    const baseDelay = replyDelays.get(replyer.id) ?? replyBaseDelay;
    const replyerActivityDelay = getNextActiveTime(replyer);
    const currentDelay = Math.max(baseDelay, replyerActivityDelay);
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
    const delayInfo = replyerActivityDelay > 0
      ? `${Math.round(currentDelay / 1000)}초 (활동시간까지 ${Math.round(replyerActivityDelay / 60000)}분)`
      : `${Math.round(currentDelay / 1000)}초`;
    console.log(`[WORKER] 일반 대댓글 job 추가: ${replyer.id} → 댓글[${targetCommentIndex}], 딜레이: ${delayInfo}`);
  }

  console.log(`[WORKER] 체인 작업 완료: 댓글 ${actualCommentCount}개, 대댓글 ${totalReplyCount}개 job 추가됨`);
};
