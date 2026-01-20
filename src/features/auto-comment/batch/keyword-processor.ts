import { HydratedDocument } from 'mongoose';
import { type NaverAccount, getPersonaId } from '@/shared/lib/account-manager';
import { generateContent } from '@/shared/api/content-api';
import { generateComment, generateReply, generateAuthorReply } from '@/shared/api/comment-gen-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { PublishedArticle, type IPublishedArticle, incrementTodayPostCount } from '@/shared/models';
import { writePostWithAccount } from './post-writer';
import { writeCommentWithAccount, writeReplyWithAccount } from '../comment-writer';
import {
  type KeywordResult,
  type CommentResult,
  type ReplyResult,
  type PostOptions,
  type DelayConfig,
  type ProgressCallback,
  getWriterAccount,
  getCommenterAccounts,
} from './types';
import { getRandomCommentCount } from './random';
import { parseKeywordWithCategory } from './keyword-utils';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface KeywordLogEntry {
  keyword: string;
  articleId?: number;
  success: boolean;
  commentCount: number;
  replyCount: number;
  error?: string;
}

export interface KeywordProcessParams {
  service: string;
  keywordInput: string;
  keywordIndex: number;
  totalKeywords: number;
  ref?: string;
  cafeId: string;
  menuId: string;
  postOptions?: PostOptions;
  delays: DelayConfig;
  accounts: NaverAccount[];
  dbConnected: boolean;
  onProgress?: ProgressCallback;
}

export interface KeywordProcessResult {
  keywordResult: KeywordResult;
  logEntry: KeywordLogEntry;
  success: boolean;
}

interface ReplyTask {
  targetCommentIndex: number;
  isAuthor: boolean;
  account: NaverAccount;
}

const buildReplyTasks = (
  writerAccount: NaverAccount,
  commenterAccounts: NaverAccount[],
  commentAuthors: Array<{ id: string; nickname: string }>,
  commentTexts: string[]
): ReplyTask[] => {
  const replyTasks: ReplyTask[] = [];
  const availableIndices = commentTexts.map((_, idx) => idx);

  const authorReplyCount = Math.floor(Math.random() * 2) + 2;
  for (let k = 0; k < authorReplyCount && availableIndices.length > 0; k++) {
    const randIdx = Math.floor(Math.random() * availableIndices.length);
    const targetIdx = availableIndices.splice(randIdx, 1)[0];
    replyTasks.push({
      targetCommentIndex: targetIdx,
      isAuthor: true,
      account: writerAccount,
    });
  }

  const normalReplyCount = Math.min(
    Math.floor(Math.random() * 3) + 2,
    availableIndices.length
  );
  for (let k = 0; k < normalReplyCount && availableIndices.length > 0; k++) {
    let targetIdx = -1;
    let replyer = commenterAccounts[k % commenterAccounts.length];

    const validIndices = availableIndices.filter(
      (idx) => commentAuthors[idx].id !== replyer.id
    );

    if (validIndices.length > 0) {
      const randIdx = Math.floor(Math.random() * validIndices.length);
      targetIdx = validIndices[randIdx];
      availableIndices.splice(availableIndices.indexOf(targetIdx), 1);
    } else {
      const otherAccountIdx = (k + 1) % commenterAccounts.length;
      replyer = commenterAccounts[otherAccountIdx];
      const retryIndices = availableIndices.filter(
        (idx) => commentAuthors[idx].id !== replyer.id
      );
      if (retryIndices.length > 0) {
        const randIdx = Math.floor(Math.random() * retryIndices.length);
        targetIdx = retryIndices[randIdx];
        availableIndices.splice(availableIndices.indexOf(targetIdx), 1);
      }
    }

    if (targetIdx === -1) {
      continue;
    }
    replyTasks.push({
      targetCommentIndex: targetIdx,
      isAuthor: false,
      account: replyer,
    });
  }

  for (let k = replyTasks.length - 1; k > 0; k--) {
    const randIdx = Math.floor(Math.random() * (k + 1));
    [replyTasks[k], replyTasks[randIdx]] = [replyTasks[randIdx], replyTasks[k]];
  }

  return replyTasks;
}

export const processKeyword = async ({
  service,
  keywordInput,
  keywordIndex,
  totalKeywords,
  ref,
  cafeId,
  menuId,
  postOptions,
  delays,
  accounts,
  dbConnected,
  onProgress,
}: KeywordProcessParams): Promise<KeywordProcessResult> => {
  const { keyword, category } = parseKeywordWithCategory(keywordInput);
  const writerAccount = getWriterAccount(accounts, keywordIndex);
  const commenterAccounts = getCommenterAccounts(accounts, writerAccount.id);

  const progressLabel = `[${keywordIndex + 1}/${totalKeywords}] "${keyword}"${category ? ` (${category})` : ''}`;

  try {
    console.log(`[BATCH] 키워드 ${keywordIndex + 1}/${totalKeywords}: "${keyword}"${category ? ` (${category})` : ''}`);

    onProgress?.({
      currentKeyword: keyword,
      keywordIndex,
      totalKeywords,
      phase: 'post',
      message: `${progressLabel} - ${writerAccount.id}로 글 작성 중...`,
    });

    const keywordWithCategory = category ? `${keyword} (카테고리: ${category})` : keyword;
    const personaId = getPersonaId(writerAccount);
    console.log('[BATCH] AI 콘텐츠 생성 요청...');
    const generated = await generateContent({ service, keyword: keywordWithCategory, ref, personaId });
    console.log('[BATCH] AI 콘텐츠 생성 완료');
    const { title, htmlContent } = buildCafePostContent(generated.content, keyword);
    const postContext = `${title}\n\n${generated.content}`;

    const postResult = await writePostWithAccount(writerAccount, {
      cafeId,
      menuId,
      subject: title,
      content: htmlContent,
      category,
      postOptions,
    });

    if (!postResult.success || !postResult.articleId) {
      const failureLog: KeywordLogEntry = {
        keyword,
        success: false,
        commentCount: 0,
        replyCount: 0,
        error: postResult.error || '글 작성 실패',
      };

      return {
        success: false,
        keywordResult: {
          keyword,
          post: postResult,
          comments: [],
          replies: [],
        },
        logEntry: failureLog,
      };
    }

    let publishedArticle: HydratedDocument<IPublishedArticle> | null = null;
    if (dbConnected) {
      const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${postResult.articleId}`;
      publishedArticle = await PublishedArticle.create({
        articleId: postResult.articleId,
        cafeId,
        menuId,
        keyword,
        title,
        content: htmlContent,
        articleUrl,
        writerAccountId: writerAccount.id,
        status: 'published',
        commentCount: 0,
        replyCount: 0,
      });

      await incrementTodayPostCount(writerAccount.id);
    }

    await sleep(delays.afterPost);

    onProgress?.({
      currentKeyword: keyword,
      keywordIndex,
      totalKeywords,
      phase: 'comments',
      message: `${progressLabel} - 댓글 작성 중...`,
    });

    const commentResults: CommentResult[] = [];
    const commentTexts: string[] = [];
    const commentAuthors: Array<{ id: string; nickname: string }> = [];
    const commentIds: Array<string | undefined> = [];
    const commentCount = getRandomCommentCount();
    const postContent = generated.content;

    for (let j = 0; j < commentCount; j++) {
      const commenter = commenterAccounts[j % commenterAccounts.length];

      let commentText: string;
      try {
        commentText = await generateComment(postContext);
      } catch {
        commentText = '좋은 정보 감사합니다!';
      }

      const result = await writeCommentWithAccount(
        commenter,
        cafeId,
        postResult.articleId,
        commentText
      );

      commentResults.push({
        accountId: result.accountId,
        success: result.success,
        commentIndex: j,
        error: result.error,
      });

      if (result.success) {
        commentTexts.push(commentText);
        commentAuthors.push({ id: commenter.id, nickname: commenter.nickname || commenter.id });
        commentIds.push(result.commentId);
      }

      if (j < commentCount - 1) {
        await sleep(delays.betweenComments);
      }
    }

    await sleep(delays.beforeReplies);

    onProgress?.({
      currentKeyword: keyword,
      keywordIndex,
      totalKeywords,
      phase: 'replies',
      message: `${progressLabel} - 대댓글 작성 중...`,
    });

    const replyResults: ReplyResult[] = [];
    const successfulComments = commentResults.filter((c) => c.success);

    if (successfulComments.length >= 2 && commentTexts.length >= 2) {
      const replyTasks = buildReplyTasks(writerAccount, commenterAccounts, commentAuthors, commentTexts);
      const writerNickname = writerAccount.nickname || writerAccount.id;

      for (let j = 0; j < replyTasks.length; j++) {
        const task = replyTasks[j];
        const parentComment = commentTexts[task.targetCommentIndex];
        const parentAuthor = commentAuthors[task.targetCommentIndex];
        const commenterNickname = task.account.nickname || task.account.id;

        let replyText: string;
        try {
          if (task.isAuthor) {
            replyText = await generateAuthorReply(postContext, parentComment, undefined, parentAuthor.nickname, writerNickname);
          } else {
            replyText = await generateReply(postContext, parentComment, undefined, writerNickname, parentAuthor.nickname, commenterNickname);
          }
        } catch {
          replyText = task.isAuthor ? '댓글 감사합니다!' : '저도 그렇게 생각해요!';
        }

        const result = await writeReplyWithAccount(
          task.account,
          cafeId,
          postResult.articleId,
          replyText,
          task.targetCommentIndex,
          {
            parentCommentId: commentIds[task.targetCommentIndex],
            parentComment,
            parentNickname: parentAuthor.nickname,
          }
        );

        replyResults.push({
          accountId: result.accountId,
          success: result.success,
          targetCommentIndex: task.targetCommentIndex,
          isAuthor: task.isAuthor,
          error: result.error,
        });

        console.log(
          `[BATCH] 대댓글 ${j + 1}/${replyTasks.length}: ${task.isAuthor ? '글쓴이' : '일반'} (${task.account.id})`
        );

        if (j < replyTasks.length - 1) {
          await sleep(delays.betweenReplies);
        }
      }
    }

    const successCommentCount = commentResults.filter((c) => c.success).length;
    const successReplyCount = replyResults.filter((r) => r.success).length;

    if (publishedArticle) {
      publishedArticle.commentCount = successCommentCount;
      publishedArticle.replyCount = successReplyCount;
      await publishedArticle.save();
    }

    const successLog: KeywordLogEntry = {
      keyword,
      articleId: postResult.articleId,
      success: true,
      commentCount: successCommentCount,
      replyCount: successReplyCount,
    };

    return {
      success: true,
      keywordResult: {
        keyword,
        post: postResult,
        comments: commentResults,
        replies: replyResults,
      },
      logEntry: successLog,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    const failureLog: KeywordLogEntry = {
      keyword,
      success: false,
      commentCount: 0,
      replyCount: 0,
      error: errorMessage,
    };

    return {
      success: false,
      keywordResult: {
        keyword,
        post: {
          success: false,
          writerAccountId: writerAccount.id,
          error: errorMessage,
        },
        comments: [],
        replies: [],
      },
      logEntry: failureLog,
    };
  }
}
