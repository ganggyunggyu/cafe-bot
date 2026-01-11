import mongoose from 'mongoose';
import { generateContent } from '@/shared/api/content-api';
import { generateComment, generateReply, generateAuthorReply } from '@/shared/api/comment-gen-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle, BatchJobLog } from '@/shared/models';
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

// 키워드:카테고리 형식 파싱 (공백 허용: "키워드 : 카테고리" 또는 "키워드:카테고리")
export const parseKeywordWithCategory = (input: string): { keyword: string; category?: string } => {
  const lastColonIndex = input.lastIndexOf(':');
  if (lastColonIndex === -1) {
    return { keyword: input.trim() };
  }

  const keyword = input.slice(0, lastColonIndex).trim();
  const category = input.slice(lastColonIndex + 1).trim();

  // 카테고리가 비어있으면 전체를 키워드로 취급
  if (!category) {
    return { keyword: input.trim() };
  }

  return { keyword, category };
}

export const runBatchJob = async (
  input: BatchJobInput,
  options: BatchJobOptions = {},
  onProgress?: ProgressCallback
): Promise<BatchJobResult> => {
  const { service, keywords, ref, cafeId: inputCafeId, postOptions } = input;
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

  const cafe = inputCafeId ? getCafeById(inputCafeId) : getDefaultCafe();

  if (!cafe) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: [],
    };
  }

  const { cafeId, menuId, name: cafeName } = cafe;
  console.log(`[BATCH] 카페: ${cafeName} (${cafeId})`)

  // MongoDB 연결 (실패해도 배치는 진행)
  let jobLog: Awaited<ReturnType<typeof BatchJobLog.create>> | null = null;
  let dbConnected = false;

  try {
    console.log('[BATCH] MongoDB 연결 시도...');
    await connectDB();

    if (mongoose.connection.readyState === 1) {
      dbConnected = true;
      console.log('[BATCH] MongoDB 연결 성공');

      jobLog = await BatchJobLog.create({
        jobType: 'publish',
        cafeId,
        keywords,
        totalKeywords: keywords.length,
        results: [],
        status: 'running',
        startedAt: new Date(),
      });
      console.log('[BATCH] 배치 로그 생성 완료:', jobLog._id.toString());
    } else {
      console.log('[BATCH] MongoDB 연결 실패 (readyState:', mongoose.connection.readyState, ') - 로깅 없이 진행');
    }
  } catch (dbError) {
    console.log('[BATCH] MongoDB 연결 실패 - 로깅 없이 진행:', dbError);
  }

  try {
    for (let i = 0; i < keywords.length; i++) {
      const rawKeyword = keywords[i];
      const { keyword, category } = parseKeywordWithCategory(rawKeyword);
      const writerAccount = getWriterAccount(accounts, i);
      const commenterAccounts = getCommenterAccounts(accounts, writerAccount.id);

      console.log(`[BATCH] 키워드 ${i + 1}/${keywords.length}: "${keyword}"${category ? ` (${category})` : ''}`);

      onProgress?.({
        currentKeyword: keyword,
        keywordIndex: i,
        totalKeywords: keywords.length,
        phase: 'post',
        message: `[${i + 1}/${keywords.length}] "${keyword}"${category ? ` (${category})` : ''} - ${writerAccount.id}로 글 작성 중...`,
      });

      // 1. AI 콘텐츠 생성 (카테고리가 있으면 키워드에 포함)
      const keywordWithCategory = category ? `${keyword} (카테고리: ${category})` : keyword;
      console.log('[BATCH] AI 콘텐츠 생성 요청...');
      const generated = await generateContent({ service, keyword: keywordWithCategory, ref });
      console.log('[BATCH] AI 콘텐츠 생성 완료');
      const { title, htmlContent } = buildCafePostContent(generated.content, keyword);

      // 2. 글 작성
      const postResult = await writePostWithAccount(writerAccount, {
        cafeId,
        menuId,
        subject: title,
        content: htmlContent,
        category,
        postOptions,
      });

      if (!postResult.success || !postResult.articleId) {
        results.push({
          keyword,
          post: postResult,
          comments: [],
          replies: [],
        });
        failed++;

        // 실패 로그 저장
        if (jobLog) {
          jobLog.results.push({
            keyword,
            success: false,
            commentCount: 0,
            replyCount: 0,
            error: postResult.error || '글 작성 실패',
          });
          jobLog.failed = failed;
          await jobLog.save();
        }

        continue;
      }

      // 발행원고 저장 (DB 연결 시)
      let publishedArticle: Awaited<ReturnType<typeof PublishedArticle.create>> | null = null;
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

      // 4. 대댓글 체인 (글쓴이 + 일반 계정 섞기)
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
        // 대댓글 작업 목록 생성 (글쓴이 + 일반)
        interface ReplyTask {
          targetCommentIndex: number;
          isAuthor: boolean;
          account: typeof writerAccount;
        }

        const replyTasks: ReplyTask[] = [];
        const availableIndices = commentTexts.map((_, idx) => idx);

        // 글쓴이 대댓글: 2~3개
        const authorReplyCount = Math.floor(Math.random() * 2) + 2; // 2~3개
        for (let k = 0; k < authorReplyCount && availableIndices.length > 0; k++) {
          const randIdx = Math.floor(Math.random() * availableIndices.length);
          const targetIdx = availableIndices.splice(randIdx, 1)[0];
          replyTasks.push({
            targetCommentIndex: targetIdx,
            isAuthor: true,
            account: writerAccount,
          });
        }

        // 일반 대댓글: 2~4개
        const normalReplyCount = Math.min(
          Math.floor(Math.random() * 3) + 2, // 2~4개
          availableIndices.length
        );
        for (let k = 0; k < normalReplyCount && availableIndices.length > 0; k++) {
          const randIdx = Math.floor(Math.random() * availableIndices.length);
          const targetIdx = availableIndices.splice(randIdx, 1)[0];
          const replyer = commenterAccounts[k % commenterAccounts.length];
          replyTasks.push({
            targetCommentIndex: targetIdx,
            isAuthor: false,
            account: replyer,
          });
        }

        // 작업 순서 섞기 (Fisher-Yates shuffle)
        for (let k = replyTasks.length - 1; k > 0; k--) {
          const randIdx = Math.floor(Math.random() * (k + 1));
          [replyTasks[k], replyTasks[randIdx]] = [replyTasks[randIdx], replyTasks[k]];
        }

        // 대댓글 작성 실행
        for (let j = 0; j < replyTasks.length; j++) {
          const task = replyTasks[j];
          const parentComment = commentTexts[task.targetCommentIndex];

          // AI로 대댓글 생성
          let replyText: string;
          try {
            if (task.isAuthor) {
              replyText = await generateAuthorReply(postContent, parentComment);
            } else {
              replyText = await generateReply(postContent, parentComment);
            }
          } catch {
            replyText = task.isAuthor ? '댓글 감사합니다!' : '저도 그렇게 생각해요!';
          }

          const result = await writeReplyWithAccount(
            task.account,
            cafeId,
            postResult.articleId,
            replyText,
            task.targetCommentIndex
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

      // 댓글/대댓글 수 집계
      const successCommentCount = commentResults.filter((c) => c.success).length;
      const successReplyCount = replyResults.filter((r) => r.success).length;

      // 발행원고 업데이트 (DB 연결 시)
      if (publishedArticle) {
        publishedArticle.commentCount = successCommentCount;
        publishedArticle.replyCount = successReplyCount;
        await publishedArticle.save();
      }

      // 성공 로그 저장
      if (jobLog) {
        jobLog.results.push({
          keyword,
          articleId: postResult.articleId,
          success: true,
          commentCount: successCommentCount,
          replyCount: successReplyCount,
        });
      }

      results.push({
        keyword,
        post: postResult,
        comments: commentResults,
        replies: replyResults,
      });

      completed++;
      if (jobLog) {
        jobLog.completed = completed;
        await jobLog.save();
      }

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

    // 배치 완료
    if (jobLog) {
      jobLog.status = failed === 0 ? 'completed' : 'failed';
      jobLog.finishedAt = new Date();
      await jobLog.save();
    }

    return {
      success: failed === 0,
      totalKeywords: keywords.length,
      completed,
      failed,
      results,
      jobLogId: jobLog?._id.toString(),
    };
  } catch (error) {
    // 에러 시 작업 로그 실패 처리
    if (jobLog) {
      jobLog.status = 'failed';
      jobLog.finishedAt = new Date();
      await jobLog.save();
    }

    return {
      success: false,
      totalKeywords: keywords.length,
      completed,
      failed: keywords.length - completed,
      results,
      jobLogId: jobLog?._id.toString(),
    };
  } finally {
    await closeAllContexts();
  }
}
