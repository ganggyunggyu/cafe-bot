import mongoose from 'mongoose';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { BatchJobLog } from '@/shared/models';
import { processArticleModification, type ModifyProcessResult } from './modify-article-processor';
import { parseKeywordWithCategory } from './keyword-utils';
import { buildBaseFilter, fetchArticlesToModify } from './modify-query-utils';
import type { ProgressCallback } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SortOrder = 'oldest' | 'newest' | 'random';

export interface ModifyBatchInput {
  service: string;
  adKeywords: string[]; // 광고 키워드 (발행원고와 1:1 매칭)
  ref?: string;
  sortOrder?: SortOrder; // 정렬 순서 (기본: oldest)
  cafeId?: string; // 카페 ID (미지정 시 기본 카페)
  daysLimit?: number; // N일 이내 원고만 (미지정 시 전체)
}

export interface ModifyKeywordResult {
  keyword: string;
  articleId: number;
  success: boolean;
  error?: string;
}

export interface ModifyBatchResult {
  success: boolean;
  totalArticles: number;
  completed: number;
  failed: number;
  results: ModifyKeywordResult[];
  jobLogId?: string;
}

export interface ModifyBatchOptions {
  delayBetweenArticles?: number;
}

export const runModifyBatchJob = async (
  input: ModifyBatchInput,
  options: ModifyBatchOptions = {},
  onProgress?: ProgressCallback
): Promise<ModifyBatchResult> => {
  const { service, adKeywords, ref, sortOrder = 'oldest', cafeId: inputCafeId, daysLimit } = input;
  const delayBetweenArticles = options.delayBetweenArticles ?? 30000;

  if (adKeywords.length === 0) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  const accounts = await getAllAccounts();

  if (accounts.length === 0) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  const cafe = inputCafeId ? await getCafeById(inputCafeId) : await getDefaultCafe();

  if (!cafe) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  const { cafeId } = cafe;
  console.log(`[MODIFY BATCH] 카페: ${cafe.name} (${cafeId})`);

  // MongoDB 연결 (수정 기능은 DB 필수)
  try {
    console.log('[MODIFY BATCH] MongoDB 연결 시도...');
    await connectDB();

    if (mongoose.connection.readyState !== 1) {
      console.log('[MODIFY BATCH] MongoDB 연결 실패 - readyState:', mongoose.connection.readyState);
      return {
        success: false,
        totalArticles: 0,
        completed: 0,
        failed: 0,
        results: [],
      };
    }
    console.log('[MODIFY BATCH] MongoDB 연결 성공');
  } catch (dbError) {
    console.error('[MODIFY BATCH] MongoDB 연결 실패:', dbError);
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  // 수정 대상 글 조회 (키워드 개수만큼)
  const limit = adKeywords.length;
  const baseFilter = buildBaseFilter(cafeId, daysLimit);
  const articlesToModify = await fetchArticlesToModify(sortOrder, limit, baseFilter);

  if (articlesToModify.length === 0) {
    return {
      success: true,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  const keywords = articlesToModify.map((a) => a.keyword);

  // 배치 작업 로그 생성
  const jobLog = await BatchJobLog.create({
    jobType: 'modify',
    cafeId,
    keywords,
    totalKeywords: articlesToModify.length,
    results: [],
    status: 'running',
    startedAt: new Date(),
  });

  const results: ModifyKeywordResult[] = [];
  let completed = 0;
  let failed = 0;

  const appendOutcome = async (outcome: ModifyProcessResult) => {
    results.push(outcome.keywordResult);

    if (outcome.success) {
      completed++;
    } else {
      failed++;
    }

    jobLog.results.push(outcome.logEntry);
    jobLog.completed = completed;
    jobLog.failed = failed;
    await jobLog.save();
  }

  try {
    for (let i = 0; i < articlesToModify.length; i++) {
      const article = articlesToModify[i];
      const { articleId, writerAccountId } = article;
      const rawAdKeyword = adKeywords[i];
      const { keyword: adKeyword } = parseKeywordWithCategory(rawAdKeyword);

      // 글 작성자 계정으로 수정해야 함
      const writerAccount = accounts.find((a) => a.id === writerAccountId);

      if (!writerAccount) {
        await appendOutcome({
          success: false,
          keywordResult: {
            keyword: adKeyword,
            articleId,
            success: false,
            error: `작성자 계정(${writerAccountId}) 없음`,
          },
          logEntry: {
            keyword: adKeyword,
            articleId,
            success: false,
            commentCount: article.commentCount,
            replyCount: article.replyCount,
            error: `작성자 계정(${writerAccountId}) 없음`,
          },
        });
        continue;
      }

      try {
        const outcome = await processArticleModification({
          service,
          adKeywordInput: rawAdKeyword,
          article,
          cafeId,
          writerAccount,
          ref,
          keywordIndex: i,
          totalKeywords: articlesToModify.length,
          onProgress,
        });

        await appendOutcome(outcome);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        await appendOutcome({
          success: false,
          keywordResult: {
            keyword: adKeyword,
            articleId,
            success: false,
            error: errorMessage,
          },
          logEntry: {
            keyword: adKeyword,
            articleId,
            success: false,
            commentCount: article.commentCount,
            replyCount: article.replyCount,
            error: errorMessage,
          },
        });
      }

      // 다음 글 전 대기
      if (i < articlesToModify.length - 1) {
        onProgress?.({
          currentKeyword: adKeyword,
          keywordIndex: i,
          totalKeywords: articlesToModify.length,
          phase: 'waiting',
          message: `다음 글 수정 전 대기 중... (${delayBetweenArticles / 1000}초)`,
        });

        await sleep(delayBetweenArticles);
      }
    }

    jobLog.status = failed === 0 ? 'completed' : 'failed';
    jobLog.finishedAt = new Date();
    await jobLog.save();

    return {
      success: failed === 0,
      totalArticles: articlesToModify.length,
      completed,
      failed,
      results,
      jobLogId: jobLog._id.toString(),
    };
  } catch (error) {
    jobLog.status = 'failed';
    jobLog.finishedAt = new Date();
    await jobLog.save();

    return {
      success: false,
      totalArticles: articlesToModify.length,
      completed,
      failed: articlesToModify.length - completed,
      results,
      jobLogId: jobLog._id.toString(),
    };
  } finally {
    await closeAllContexts();
  }
}
