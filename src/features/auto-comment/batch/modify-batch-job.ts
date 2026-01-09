import mongoose from 'mongoose';
import { generateContent } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle, ModifiedArticle, BatchJobLog, type IPublishedArticle } from '@/shared/models';
import { modifyArticleWithAccount } from './article-modifier';
import { parseKeywordWithCategory } from './batch-job';
import type { ProgressCallback } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SortOrder = 'oldest' | 'newest' | 'random';

export interface ModifyBatchInput {
  service: string;
  adKeywords: string[]; // 광고 키워드 (발행원고와 1:1 매칭)
  ref?: string;
  sortOrder?: SortOrder; // 정렬 순서 (기본: oldest)
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
  const { service, adKeywords, ref, sortOrder = 'oldest' } = input;
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

  const accounts = getAllAccounts();

  if (accounts.length === 0) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  const cafeId = process.env.NAVER_CAFE_ID;

  if (!cafeId) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

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
  let articlesToModify: IPublishedArticle[];

  if (sortOrder === 'random') {
    articlesToModify = await PublishedArticle.aggregate([
      { $match: { cafeId, status: 'published' } },
      { $sample: { size: limit } },
    ]);
  } else {
    const sortDirection = sortOrder === 'oldest' ? 1 : -1;
    articlesToModify = await PublishedArticle.find({ cafeId, status: 'published' })
      .sort({ publishedAt: sortDirection })
      .limit(limit);
  }

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

  try {
    for (let i = 0; i < articlesToModify.length; i++) {
      const article = articlesToModify[i];
      const { articleId, writerAccountId } = article;
      const rawAdKeyword = adKeywords[i];
      const { keyword: adKeyword, category } = parseKeywordWithCategory(rawAdKeyword);

      // 글 작성자 계정으로 수정해야 함
      const writerAccount = accounts.find((a) => a.id === writerAccountId);

      if (!writerAccount) {
        results.push({
          keyword: adKeyword,
          articleId,
          success: false,
          error: `작성자 계정(${writerAccountId}) 없음`,
        });
        failed++;

        jobLog.results.push({
          keyword: adKeyword,
          articleId,
          success: false,
          commentCount: 0,
          replyCount: 0,
          error: `작성자 계정(${writerAccountId}) 없음`,
        });
        jobLog.failed = failed;
        await jobLog.save();

        continue;
      }

      onProgress?.({
        currentKeyword: adKeyword,
        keywordIndex: i,
        totalKeywords: articlesToModify.length,
        phase: 'post',
        message: `[${i + 1}/${articlesToModify.length}] "${adKeyword}" - 광고글로 수정 중...`,
      });

      // 광고 콘텐츠 생성 (새 광고 키워드 사용)
      const generated = await generateContent({ service, keyword: adKeyword, ref });
      const { title: newTitle, htmlContent: newContent } = buildCafePostContent(generated.content, adKeyword);

      // 글 수정
      const modifyResult = await modifyArticleWithAccount(writerAccount, {
        cafeId,
        articleId,
        newTitle,
        newContent,
        category,
      });

      if (!modifyResult.success) {
        results.push({
          keyword: adKeyword,
          articleId,
          success: false,
          error: modifyResult.error,
        });
        failed++;

        jobLog.results.push({
          keyword: adKeyword,
          articleId,
          success: false,
          commentCount: 0,
          replyCount: 0,
          error: modifyResult.error,
        });
        jobLog.failed = failed;
        await jobLog.save();

        continue;
      }

      // ModifiedArticle 저장
      await ModifiedArticle.create({
        originalArticleId: article._id,
        articleId,
        cafeId,
        keyword: adKeyword,
        newTitle,
        newContent,
        modifiedAt: new Date(),
        modifiedBy: writerAccountId,
      });

      // PublishedArticle 삭제 (수정 완료 후 발행원고에서 제거)
      await PublishedArticle.deleteOne({ _id: article._id });

      results.push({
        keyword: adKeyword,
        articleId,
        success: true,
      });

      completed++;

      jobLog.results.push({
        keyword: adKeyword,
        articleId,
        success: true,
        commentCount: article.commentCount,
        replyCount: article.replyCount,
      });
      jobLog.completed = completed;
      await jobLog.save();

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
