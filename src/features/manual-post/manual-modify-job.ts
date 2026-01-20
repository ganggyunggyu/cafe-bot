'use server';

import mongoose from 'mongoose';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { BatchJobLog, ModifiedArticle, PublishedArticle } from '@/shared/models';
import { buildBaseFilter, fetchArticlesToModify } from '@/features/auto-comment/batch/modify-query-utils';
import { modifyArticleWithAccount } from '@/features/auto-comment/batch/article-modifier';
import type { ProgressCallback } from '@/features/auto-comment/batch/types';
import type {
  ManualModifyInput,
  ManualModifyResult,
  ManuscriptModifyResult,
  ManuscriptFolder,
} from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SortOrder = 'oldest' | 'newest' | 'random';

export interface ManualModifyOptions {
  delayBetweenArticles?: number;
}

export const runManualModify = async (
  input: ManualModifyInput,
  options: ManualModifyOptions = {},
  onProgress?: ProgressCallback
): Promise<ManualModifyResult> => {
  const { manuscripts, cafeId: inputCafeId, daysLimit, sortOrder = 'oldest' } = input;
  const delayBetweenArticles = options.delayBetweenArticles ?? 30000;

  console.log('[MANUAL MODIFY] 시작');
  console.log('[MANUAL MODIFY] 원고 수:', manuscripts.length);

  if (manuscripts.length === 0) {
    return {
      success: false,
      totalManuscripts: 0,
      completed: 0,
      failed: 0,
      results: [],
    };
  }

  const accounts = await getAllAccounts();
  if (accounts.length === 0) {
    return {
      success: false,
      totalManuscripts: manuscripts.length,
      completed: 0,
      failed: manuscripts.length,
      results: manuscripts.map((m) => ({
        folderName: m.folderName,
        originalArticleId: 0,
        newTitle: m.title,
        success: false,
        error: '등록된 계정 없음',
      })),
    };
  }

  const cafe = inputCafeId ? await getCafeById(inputCafeId) : await getDefaultCafe();
  if (!cafe) {
    return {
      success: false,
      totalManuscripts: manuscripts.length,
      completed: 0,
      failed: manuscripts.length,
      results: manuscripts.map((m) => ({
        folderName: m.folderName,
        originalArticleId: 0,
        newTitle: m.title,
        success: false,
        error: '카페 정보 없음',
      })),
    };
  }

  const { cafeId } = cafe;
  console.log(`[MANUAL MODIFY] 카페: ${cafe.name} (${cafeId})`);

  try {
    console.log('[MANUAL MODIFY] MongoDB 연결 시도...');
    await connectDB();

    if (mongoose.connection.readyState !== 1) {
      console.log('[MANUAL MODIFY] MongoDB 연결 실패');
      return {
        success: false,
        totalManuscripts: manuscripts.length,
        completed: 0,
        failed: manuscripts.length,
        results: manuscripts.map((m) => ({
          folderName: m.folderName,
          originalArticleId: 0,
          newTitle: m.title,
          success: false,
          error: 'MongoDB 연결 실패',
        })),
      };
    }
    console.log('[MANUAL MODIFY] MongoDB 연결 성공');
  } catch (dbError) {
    console.error('[MANUAL MODIFY] MongoDB 연결 실패:', dbError);
    return {
      success: false,
      totalManuscripts: manuscripts.length,
      completed: 0,
      failed: manuscripts.length,
      results: manuscripts.map((m) => ({
        folderName: m.folderName,
        originalArticleId: 0,
        newTitle: m.title,
        success: false,
        error: 'MongoDB 연결 실패',
      })),
    };
  }

  // 수정 대상 글 조회 (원고 개수만큼)
  const limit = manuscripts.length;
  const baseFilter = buildBaseFilter(cafeId, daysLimit);
  const articlesToModify = await fetchArticlesToModify(sortOrder, limit, baseFilter);

  if (articlesToModify.length === 0) {
    return {
      success: true,
      totalManuscripts: manuscripts.length,
      completed: 0,
      failed: 0,
      results: manuscripts.map((m) => ({
        folderName: m.folderName,
        originalArticleId: 0,
        newTitle: m.title,
        success: false,
        error: '수정 가능한 발행원고 없음',
      })),
    };
  }

  // 실제 수정할 개수 (원고 수와 발행원고 수 중 작은 값)
  const actualCount = Math.min(manuscripts.length, articlesToModify.length);

  // 배치 작업 로그 생성
  const jobLog = await BatchJobLog.create({
    jobType: 'modify',
    cafeId,
    keywords: manuscripts.slice(0, actualCount).map((m) => m.folderName),
    totalKeywords: actualCount,
    results: [],
    status: 'running',
    startedAt: new Date(),
  });

  const results: ManuscriptModifyResult[] = [];
  let completed = 0;
  let failed = 0;

  try {
    for (let i = 0; i < actualCount; i++) {
      const manuscript = manuscripts[i];
      const article = articlesToModify[i];
      const { articleId, writerAccountId, commentCount, replyCount } = article;

      const writerAccount = accounts.find((a) => a.id === writerAccountId);

      if (!writerAccount) {
        results.push({
          folderName: manuscript.folderName,
          originalArticleId: articleId,
          newTitle: manuscript.title,
          success: false,
          error: `작성자 계정(${writerAccountId}) 없음`,
        });
        failed++;

        jobLog.results.push({
          keyword: manuscript.folderName,
          articleId,
          success: false,
          commentCount,
          replyCount,
          error: `작성자 계정(${writerAccountId}) 없음`,
        });
        await jobLog.save();
        continue;
      }

      try {
        onProgress?.({
          currentKeyword: manuscript.title,
          keywordIndex: i,
          totalKeywords: actualCount,
          phase: 'post',
          message: `[${i + 1}/${actualCount}] "${manuscript.folderName}" - 수정 중...`,
        });

        // 글 수정 (AI 생성 없이 원고 내용 그대로 사용)
        const modifyResult = await modifyArticleWithAccount(writerAccount, {
          cafeId,
          articleId,
          newTitle: manuscript.title,
          newContent: manuscript.htmlContent,
          category: manuscript.category,
          images: manuscript.images.length > 0 ? manuscript.images : undefined,
        });

        if (!modifyResult.success) {
          results.push({
            folderName: manuscript.folderName,
            originalArticleId: articleId,
            newTitle: manuscript.title,
            success: false,
            error: modifyResult.error || '글 수정 실패',
          });
          failed++;

          jobLog.results.push({
            keyword: manuscript.folderName,
            articleId,
            success: false,
            commentCount,
            replyCount,
            error: modifyResult.error || '글 수정 실패',
          });
          await jobLog.save();
          continue;
        }

        // ModifiedArticle 저장
        await ModifiedArticle.create({
          originalArticleId: article._id,
          articleId,
          cafeId,
          keyword: manuscript.folderName,
          newTitle: manuscript.title,
          newContent: manuscript.htmlContent,
          modifiedAt: new Date(),
          modifiedBy: writerAccountId,
        });

        // PublishedArticle 삭제
        await PublishedArticle.deleteOne({ _id: article._id });

        results.push({
          folderName: manuscript.folderName,
          originalArticleId: articleId,
          newTitle: manuscript.title,
          success: true,
        });
        completed++;

        jobLog.results.push({
          keyword: manuscript.folderName,
          articleId,
          success: true,
          commentCount,
          replyCount,
        });
        jobLog.completed = completed;
        await jobLog.save();

        console.log(`[MANUAL MODIFY] 수정 완료: ${manuscript.folderName} (articleId: ${articleId})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        results.push({
          folderName: manuscript.folderName,
          originalArticleId: articleId,
          newTitle: manuscript.title,
          success: false,
          error: errorMessage,
        });
        failed++;

        jobLog.results.push({
          keyword: manuscript.folderName,
          articleId,
          success: false,
          commentCount,
          replyCount,
          error: errorMessage,
        });
        jobLog.failed = failed;
        await jobLog.save();
      }

      // 다음 글 전 대기
      if (i < actualCount - 1) {
        onProgress?.({
          currentKeyword: manuscript.title,
          keywordIndex: i,
          totalKeywords: actualCount,
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
      totalManuscripts: actualCount,
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
      totalManuscripts: actualCount,
      completed,
      failed: actualCount - completed,
      results,
      jobLogId: jobLog._id.toString(),
    };
  } finally {
    await closeAllContexts();
  }
};
