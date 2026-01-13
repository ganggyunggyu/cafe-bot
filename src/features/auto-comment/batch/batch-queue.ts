import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeById, getDefaultCafe } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { addTaskJob, getQueueStatus, closeAllQueues } from '@/shared/lib/queue';
import { startAllTaskWorkers, closeAllWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { generateContent } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { PostJobData } from '@/shared/lib/queue/types';
import type { BatchJobInput } from './types';

export interface QueueBatchResult {
  success: boolean;
  jobsAdded: number;
  message: string;
}

// 큐에 배치 작업 추가 (병렬 처리)
export const addBatchToQueue = async (
  input: BatchJobInput
): Promise<QueueBatchResult> => {
  const { service, keywords, ref, cafeId: inputCafeId, postOptions, skipComments } = input;

  const accounts = getAllAccounts();
  if (accounts.length < 2) {
    return { success: false, jobsAdded: 0, message: '계정이 2개 이상 필요해' };
  }

  const cafe = inputCafeId ? getCafeById(inputCafeId) : getDefaultCafe();
  if (!cafe) {
    return { success: false, jobsAdded: 0, message: '카페를 찾을 수 없어' };
  }

  await connectDB();
  const settings = await getQueueSettings();

  // 워커 시작
  startAllTaskWorkers();

  let jobsAdded = 0;

  // 계정별 딜레이 추적 (각 계정 큐가 독립적으로 딜레이 누적)
  const accountDelays: Map<string, number> = new Map();

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const writerAccount = accounts[i % accounts.length];

    try {
      // AI 콘텐츠 생성
      console.log(`[QUEUE-BATCH] 콘텐츠 생성 중: ${keyword}`);
      const generated = await generateContent({ keyword, service, ref });

      if (!generated.content) {
        console.error(`[QUEUE-BATCH] 콘텐츠 생성 실패: ${keyword}`);
        continue;
      }

      const { title, htmlContent } = buildCafePostContent(generated.content, keyword);

      // 계정별 딜레이 계산 (해당 계정의 누적 딜레이만 증가)
      const currentDelay = accountDelays.get(writerAccount.id) ?? 0;
      const randomDelay = getRandomDelay(settings.delays.betweenPosts);
      const newDelay = currentDelay + randomDelay;
      accountDelays.set(writerAccount.id, newDelay);

      // Task Job 추가
      const jobData: PostJobData = {
        type: 'post',
        accountId: writerAccount.id,
        cafeId: cafe.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: htmlContent,
        postOptions,
        keyword,
        service, // 댓글 생성용
        rawContent: generated.content, // 댓글 생성용
        skipComments, // 글만 발행 모드
      };

      await addTaskJob(writerAccount.id, jobData, currentDelay);
      jobsAdded++;

      console.log(
        `[QUEUE-BATCH] Job 추가: ${keyword} → ${writerAccount.id}, 딜레이: ${Math.round(currentDelay / 1000)}초 (다음: ${Math.round(newDelay / 1000)}초)`
      );
    } catch (error) {
      console.error(`[QUEUE-BATCH] 에러: ${keyword}`, error);
    }
  }

  return {
    success: jobsAdded > 0,
    jobsAdded,
    message: `${jobsAdded}개 작업이 큐에 추가됨 (${accounts.length}개 계정 병렬 처리)`,
  };
};

// 큐 상태 조회
export const getBatchQueueStatus = async () => {
  const accounts = getAllAccounts();
  const statuses: Record<string, { waiting: number; active: number; completed: number; failed: number }> = {};

  for (const account of accounts) {
    statuses[account.id] = await getQueueStatus(account.id);
  }

  return statuses;
};

// 모든 큐/워커 종료
export const stopBatchQueue = async () => {
  await closeAllWorkers();
  await closeAllQueues();
  console.log('[QUEUE-BATCH] 모든 큐/워커 종료');
};
