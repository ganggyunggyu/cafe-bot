import { PostJobData, CommentJobData, ReplyJobData, JobResult } from '../types';
import { addTaskJob } from '../index';
import { writePostWithAccount } from '@/features/auto-comment/batch/post-writer';
import { generateComment, generateReply, generateAuthorReply } from '@/shared/api/comment-gen-api';
import { getPersonaId, getNextActiveTime, NaverAccount } from '@/shared/lib/account-manager';
import { getRandomDelay } from '@/shared/models/queue-settings';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle, incrementTodayPostCount } from '@/shared/models';
import mongoose from 'mongoose';

export interface PostHandlerContext {
  account: NaverAccount;
  accounts: NaverAccount[];
  settings: {
    timeout: number;
    delays: {
      afterPost: { min: number; max: number };
      betweenComments: { min: number; max: number };
    };
    limits?: {
      maxCommentsPerAccount?: number;
    };
  };
}

export const handlePostJob = async (
  data: PostJobData,
  ctx: PostHandlerContext
): Promise<JobResult> => {
  const { account, accounts, settings } = ctx;

  const result = await Promise.race([
    writePostWithAccount(account, {
      cafeId: data.cafeId,
      menuId: data.menuId,
      subject: data.subject,
      content: data.content,
      category: data.category,
      postOptions: data.postOptions,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('타임아웃')), settings.timeout)
    ),
  ]);

  if (!result.success) {
    throw new Error(result.error || '글 작성 실패');
  }

  try {
    if (result.articleId && !data.skipComments) {
      await handlePostSuccess(data, result.articleId, accounts, settings);
    } else if (result.articleId && data.skipComments) {
      await saveArticleOnly(data, result.articleId);
    }
  } catch (chainError) {
    console.error('[WORKER] 체인 작업 중 오류 (글 발행은 완료됨):', chainError);
  }

  return {
    success: true,
    articleId: result.articleId,
    articleUrl: result.articleUrl,
  };
};

const saveArticleOnly = async (
  postData: PostJobData,
  articleId: number
): Promise<void> => {
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

      await incrementTodayPostCount(writerAccountId);
      console.log(`[WORKER] 원고 저장 완료 (글만 발행): #${articleId}`);
    }
  } catch (dbError) {
    console.error('[WORKER] 원고 저장 실패:', dbError);
  }
};

const handlePostSuccess = async (
  postData: PostJobData,
  articleId: number,
  accounts: NaverAccount[],
  settings: PostHandlerContext['settings']
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
        comments: [],
      });

      await incrementTodayPostCount(writerAccountId);
      console.log(`[WORKER] 원고 저장 완료: #${articleId}, _id=${created._id}`);
    } else {
      console.log(`[WORKER] MongoDB 미연결 - 원고 저장 스킵: #${articleId}`);
    }
  } catch (dbError) {
    console.error('[WORKER] 원고 저장 실패:', dbError);
  }

  // 2. 댓글 job 추가
  const commenterAccounts = accounts.filter((a) => a.id !== writerAccountId);
  if (commenterAccounts.length === 0) {
    console.log('[WORKER] 댓글 계정 없음 - 스킵');
    return;
  }

  const writerAccount = accounts.find((a) => a.id === writerAccountId);
  const writerNickname = writerAccount?.nickname || writerAccountId;

  const postContent = rawContent || content;
  const postContext = `${subject}\n\n${postContent}`;

  const commentDelays: Map<string, number> = new Map();
  const afterPostDelay = getRandomDelay(settings.delays.afterPost);

  const maxCommentsPerAccount = settings.limits?.maxCommentsPerAccount ?? 1;
  const commentCount = commenterAccounts.length;

  console.log(`[WORKER] 댓글 ${commentCount}개 job 추가 예정 (계정당 ${maxCommentsPerAccount}개)`);

  const commentAuthors: Array<{ id: string; nickname: string }> = [];
  const commentContents: string[] = [];
  const accountCommentCounts: Map<string, number> = new Map();

  for (let i = 0; i < commentCount; i++) {
    const commenter = commenterAccounts[i % commenterAccounts.length];
    const currentCount = accountCommentCounts.get(commenter.id) ?? 0;

    if (maxCommentsPerAccount > 0 && currentCount >= maxCommentsPerAccount) continue;

    const personaId = getPersonaId(commenter);
    accountCommentCounts.set(commenter.id, (accountCommentCounts.get(commenter.id) ?? 0) + 1);

    let commentText: string;
    try {
      commentText = await generateComment(postContext, personaId, writerNickname);
    } catch {
      commentText = '좋은 정보 감사합니다!';
    }

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

    const commenterNickname = commenter.nickname || commenter.id;
    commentAuthors.push({ id: commenter.id, nickname: commenterNickname });
    commentContents.push(commentText);
  }

  // 3. 대댓글 job 추가
  const actualCommentCount = commentAuthors.length;
  if (actualCommentCount === 0) {
    console.log('[WORKER] 댓글이 없어서 대댓글 스킵');
    return;
  }

  const authorReplyCount = actualCommentCount === 1
    ? Math.random() < 0.5 ? 0 : 1
    : Math.min(Math.floor(Math.random() * 2) + 1, actualCommentCount);
  const remainingComments = actualCommentCount - authorReplyCount;
  const normalReplyCount = remainingComments > 0
    ? Math.min(Math.floor(Math.random() * 2) + 1, remainingComments)
    : 0;
  const totalReplyCount = authorReplyCount + normalReplyCount;

  console.log(`[WORKER] 대댓글 ${totalReplyCount}개 job 추가 예정 (글쓴이: ${authorReplyCount}, 일반: ${normalReplyCount})`);

  const maxCommentDelay = Math.max(...Array.from(commentDelays.values()), afterPostDelay);
  const replyBaseDelay = maxCommentDelay + getRandomDelay(settings.delays.afterPost);

  const replyDelays: Map<string, number> = new Map();
  const repliedCommentIndices: Set<number> = new Set();

  // 글쓴이 대댓글
  if (writerAccount && authorReplyCount > 0) {
    const writerPersonaId = getPersonaId(writerAccount);
    const writerActivityDelay = getNextActiveTime(writerAccount);

    for (let i = 0; i < authorReplyCount; i++) {
      let targetCommentIndex = -1;
      for (let j = 0; j < actualCommentCount; j++) {
        const idx = (i + j) % actualCommentCount;
        if (!repliedCommentIndices.has(idx)) {
          targetCommentIndex = idx;
          break;
        }
      }

      if (targetCommentIndex === -1) {
        console.log(`[WORKER] 글쓴이 대댓글 ${i} - 대댓글 달 댓글 없어서 스킵`);
        continue;
      }
      repliedCommentIndices.add(targetCommentIndex);

      const targetCommentAuthor = commentAuthors[targetCommentIndex];
      const parentAuthorNickname = targetCommentAuthor?.nickname;
      const parentCommentContent = commentContents[targetCommentIndex] || '댓글 감사합니다';

      let replyText: string;
      try {
        replyText = await generateAuthorReply(
          postContext,
          parentCommentContent,
          writerPersonaId,
          parentAuthorNickname,
          writerNickname
        );
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

  // 일반 대댓글
  for (let i = 0; i < normalReplyCount; i++) {
    let targetCommentIndex = -1;
    for (let j = 0; j < actualCommentCount; j++) {
      const idx = (i + j) % actualCommentCount;
      if (!repliedCommentIndices.has(idx)) {
        targetCommentIndex = idx;
        break;
      }
    }

    if (targetCommentIndex === -1) {
      console.log(`[WORKER] 일반 대댓글 ${i} - 모든 댓글에 대댓글 있어서 스킵`);
      continue;
    }

    repliedCommentIndices.add(targetCommentIndex);
    const targetCommentAuthor = commentAuthors[targetCommentIndex];

    if (!targetCommentAuthor?.id) {
      console.log(`[WORKER] 일반 대댓글 ${i} - 댓글 작성자 정보 없음 (index: ${targetCommentIndex})`);
      continue;
    }

    console.log(
      `[WORKER] 대댓글 계정 선택: 댓글[${targetCommentIndex}] 작성자=${targetCommentAuthor.id}, 후보=${commenterAccounts.map((a) => a.id).join(',')}`
    );
    const availableReplyers = commenterAccounts.filter((a) => a.id !== targetCommentAuthor.id);
    if (availableReplyers.length === 0) {
      console.log(`[WORKER] 일반 대댓글 ${i} - 사용 가능한 계정 없어서 스킵 (댓글 작성자: ${targetCommentAuthor.id})`);
      continue;
    }

    const replyer = availableReplyers[i % availableReplyers.length];
    const replyerPersonaId = getPersonaId(replyer);
    const replyerNickname = replyer.nickname || replyer.id;

    const parentCommentContent = commentContents[targetCommentIndex] || '좋은 정보네요';
    let replyText: string;
    try {
      replyText = await generateReply(
        postContext,
        parentCommentContent,
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
