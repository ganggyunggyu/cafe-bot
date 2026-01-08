import { generateContent } from '@/shared/api/content-api';
import { generateComment, generateReply } from '@/shared/api/comment-gen-api';
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
import { getRandomCommentCount } from './random';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runBatchJob(
  input: BatchJobInput,
  options: BatchJobOptions = {},
  onProgress?: ProgressCallback
): Promise<BatchJobResult> {
  const { service, keywords, ref } = input;
  const delays = { ...DEFAULT_DELAYS, ...options.delays };

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
      const commentTexts: string[] = []; // 대댓글용 저장
      const commentCount = getRandomCommentCount(); // 5~10개 랜덤
      const postContent = generated.content; // 글 내용 (API용)

      for (let j = 0; j < commentCount; j++) {
        const commenter = commenterAccounts[j % commenterAccounts.length];

        // AI로 댓글 생성
        let commentText: string;
        try {
          commentText = await generateComment(postContent);
        } catch {
          commentText = '좋은 정보 감사합니다!'; // 폴백
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
          commentTexts.push(commentText); // 성공한 댓글 저장
        }

        if (j < commentCount - 1) {
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

      if (successfulComments.length >= 2 && commentTexts.length >= 2) {
        // 대댓글 개수: 2~4개 랜덤 (댓글 수 이하)
        const maxReplies = Math.min(4, commentTexts.length);
        const replyCount = Math.floor(Math.random() * (maxReplies - 1)) + 2; // 2 ~ maxReplies

        // 랜덤 댓글 인덱스 선택 (중복 방지)
        const availableIndices = commentTexts.map((_, idx) => idx);
        const selectedIndices: number[] = [];
        for (let k = 0; k < replyCount && availableIndices.length > 0; k++) {
          const randIdx = Math.floor(Math.random() * availableIndices.length);
          selectedIndices.push(availableIndices.splice(randIdx, 1)[0]);
        }

        for (let j = 0; j < selectedIndices.length; j++) {
          const targetCommentIndex = selectedIndices[j];
          const replyerIndex = (j + 1) % commenterAccounts.length;
          const replyer = commenterAccounts[replyerIndex];
          const parentComment = commentTexts[targetCommentIndex];

          // AI로 대댓글 생성 (글 내용 + 부모 댓글)
          let replyText: string;
          try {
            replyText = await generateReply(postContent, parentComment);
          } catch {
            replyText = '저도 그렇게 생각해요!'; // 폴백
          }

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

          if (j < selectedIndices.length - 1) {
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
