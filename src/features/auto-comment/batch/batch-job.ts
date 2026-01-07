import { generateContent } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { writePostWithAccount } from './post-writer';
import { writeCommentWithAccount, writeReplyWithAccount } from '../comment-writer';
import {
  type BatchJobInput,
  type BatchJobResult,
  type BatchJobOptions,
  type KeywordResult,
  type CommentResult,
  type ReplyResult,
  type ProgressCallback,
  DEFAULT_DELAYS,
  getWriterAccount,
  getCommenterAccounts,
} from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 기본 댓글 템플릿
const DEFAULT_COMMENT_TEMPLATES = [
  '좋은 정보 감사합니다!',
  '도움이 많이 됐어요~',
  '저도 관심있었는데 좋네요',
  '잘 보고 갑니다!',
  '공유 감사해요 ㅎㅎ',
];

// 기본 대댓글 템플릿
const DEFAULT_REPLY_TEMPLATES = [
  '저도 그렇게 생각해요!',
  '맞아요 ㅎㅎ',
  '동감이에요~',
  '좋은 의견이시네요',
  '저도요!',
];

function getRandomTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

export async function runBatchJob(
  input: BatchJobInput,
  options: BatchJobOptions = {},
  onProgress?: ProgressCallback
): Promise<BatchJobResult> {
  const { service, keywords, ref, commentTemplates, replyTemplates } = input;
  const delays = { ...DEFAULT_DELAYS, ...options.delays };
  const comments = commentTemplates?.length ? commentTemplates : DEFAULT_COMMENT_TEMPLATES;
  const replies = replyTemplates?.length ? replyTemplates : DEFAULT_REPLY_TEMPLATES;

  const accounts = getAllAccounts();

  if (accounts.length < 2) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: [],
    };
  }

  const results: KeywordResult[] = [];
  let completed = 0;
  let failed = 0;

  const cafeId = process.env.NAVER_CAFE_ID;
  const menuId = process.env.NAVER_CAFE_MENU_ID;

  if (!cafeId || !menuId) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: [],
    };
  }

  try {
    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      const writerAccount = getWriterAccount(accounts, i);
      const commenterAccounts = getCommenterAccounts(accounts, writerAccount.id);

      onProgress?.({
        currentKeyword: keyword,
        keywordIndex: i,
        totalKeywords: keywords.length,
        phase: 'post',
        message: `[${i + 1}/${keywords.length}] "${keyword}" - ${writerAccount.id}로 글 작성 중...`,
      });

      // 1. AI 콘텐츠 생성
      const generated = await generateContent({ service, keyword, ref });
      const { title, htmlContent } = buildCafePostContent(generated.content, keyword);

      // 2. 글 작성
      const postResult = await writePostWithAccount(writerAccount, {
        cafeId,
        menuId,
        subject: title,
        content: htmlContent,
      });

      if (!postResult.success || !postResult.articleId) {
        results.push({
          keyword,
          post: postResult,
          comments: [],
          replies: [],
        });
        failed++;
        continue;
      }

      await sleep(delays.afterPost);

      // 3. 댓글 작성
      onProgress?.({
        currentKeyword: keyword,
        keywordIndex: i,
        totalKeywords: keywords.length,
        phase: 'comments',
        message: `[${i + 1}/${keywords.length}] "${keyword}" - 댓글 작성 중...`,
      });

      const commentResults: CommentResult[] = [];

      for (let j = 0; j < commenterAccounts.length; j++) {
        const commenter = commenterAccounts[j];
        const commentText = getRandomTemplate(comments);

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

        if (j < commenterAccounts.length - 1) {
          await sleep(delays.betweenComments);
        }
      }

      await sleep(delays.beforeReplies);

      // 4. 대댓글 체인 (로테이션)
      onProgress?.({
        currentKeyword: keyword,
        keywordIndex: i,
        totalKeywords: keywords.length,
        phase: 'replies',
        message: `[${i + 1}/${keywords.length}] "${keyword}" - 대댓글 작성 중...`,
      });

      const replyResults: ReplyResult[] = [];
      const successfulComments = commentResults.filter((c) => c.success);

      if (successfulComments.length >= 2) {
        // 로테이션: 다음 계정이 이전 댓글에 답글
        for (let j = 0; j < successfulComments.length; j++) {
          const targetCommentIndex = j;
          const replyerIndex = (j + 1) % commenterAccounts.length;
          const replyer = commenterAccounts[replyerIndex];
          const replyText = getRandomTemplate(replies);

          const result = await writeReplyWithAccount(
            replyer,
            cafeId,
            postResult.articleId,
            replyText,
            targetCommentIndex
          );

          replyResults.push({
            accountId: result.accountId,
            success: result.success,
            targetCommentIndex,
            error: result.error,
          });

          if (j < successfulComments.length - 1) {
            await sleep(delays.betweenReplies);
          }
        }
      }

      results.push({
        keyword,
        post: postResult,
        comments: commentResults,
        replies: replyResults,
      });

      completed++;

      // 다음 키워드 전 대기
      if (i < keywords.length - 1) {
        onProgress?.({
          currentKeyword: keyword,
          keywordIndex: i,
          totalKeywords: keywords.length,
          phase: 'waiting',
          message: `다음 키워드 전 대기 중... (${delays.betweenKeywords / 1000}초)`,
        });

        await sleep(delays.betweenKeywords);
      }
    }

    return {
      success: failed === 0,
      totalKeywords: keywords.length,
      completed,
      failed,
      results,
    };
  } catch (error) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed,
      failed: keywords.length - completed,
      results,
    };
  } finally {
    await closeAllContexts();
  }
}
