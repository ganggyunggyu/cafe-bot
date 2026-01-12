import mongoose, { HydratedDocument } from 'mongoose';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { BatchJobLog, type IBatchJobLog } from '@/shared/models';
import {
  type BatchJobInput,
  type BatchJobResult,
  type BatchJobOptions,
  type KeywordResult,
  type ProgressCallback,
  DEFAULT_DELAYS,
  getWriterAccount,
} from './types';
import { processKeyword } from './keyword-processor';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runBatchJob = async (
  input: BatchJobInput,
  options: BatchJobOptions = {},
  onProgress?: ProgressCallback
): Promise<BatchJobResult> => {
  const { service, keywords, ref, cafeId: inputCafeId, postOptions } = input;
  const delays = { ...DEFAULT_DELAYS, ...options.delays };

  console.log('[BATCH] runBatchJob 시작');
  console.log('[BATCH] input:', JSON.stringify({ service, keywords: keywords.length, cafeId: inputCafeId }));

  const accounts = getAllAccounts();
  console.log('[BATCH] 계정 수:', accounts.length);

  if (accounts.length < 2) {
    console.log('[BATCH] 계정 수 부족으로 종료');
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
  console.log('[BATCH] 카페 조회:', inputCafeId, '->', cafe?.name);

  if (!cafe) {
    console.log('[BATCH] 카페를 찾을 수 없어 종료');
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
  let jobLog: HydratedDocument<IBatchJobLog> | null = null;
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

  const recordUnexpectedFailure = async (
    keyword: string,
    writerAccountId: string,
    error: unknown
  ) => {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    failed++;

    results.push({
      keyword,
      post: {
        success: false,
        writerAccountId,
        error: errorMessage,
      },
      comments: [],
      replies: [],
    });

    if (jobLog) {
      jobLog.results.push({
        keyword,
        success: false,
        commentCount: 0,
        replyCount: 0,
        error: errorMessage,
      });
      jobLog.failed = failed;
      await jobLog.save();
    }
  }

  try {
    for (let i = 0; i < keywords.length; i++) {
      const rawKeyword = keywords[i];
      const writerAccount = getWriterAccount(accounts, i);

      try {
        const { keywordResult, logEntry, success } = await processKeyword({
          service,
          keywordInput: rawKeyword,
          keywordIndex: i,
          totalKeywords: keywords.length,
          ref,
          cafeId,
          menuId,
          postOptions,
          delays,
          accounts,
          dbConnected,
          onProgress,
        });

        results.push(keywordResult);

        if (jobLog) {
          jobLog.results.push(logEntry);
          jobLog.completed = completed + (success ? 1 : 0);
          jobLog.failed = failed + (success ? 0 : 1);
          await jobLog.save();
        }

        if (success) {
          completed++;
        } else {
          failed++;
        }
      } catch (error) {
        await recordUnexpectedFailure(rawKeyword, writerAccount.id, error);
      }

      // 다음 키워드 전 대기
      if (i < keywords.length - 1) {
        onProgress?.({
          currentKeyword: rawKeyword,
          keywordIndex: i,
          totalKeywords: keywords.length,
          phase: 'waiting',
          message: `다음 키워드 전 대기 중... (${delays.betweenKeywords / 1000}초)`,
        });

        await sleep(delays.betweenKeywords);
      }
    }

    // 배치 완료
    console.log('[BATCH] 배치 완료 - completed:', completed, 'failed:', failed);
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
    console.error('[BATCH] 에러 발생:', error);
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
    console.log('[BATCH] finally - closeAllContexts 호출');
    await closeAllContexts();
  }
}
