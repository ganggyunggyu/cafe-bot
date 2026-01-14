import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeById, getDefaultCafe } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { addTaskJob, getQueueStatus, closeAllQueues } from '@/shared/lib/queue';
import { startAllTaskWorkers, closeAllWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { getRemainingPostsToday } from '@/shared/models/daily-post-count';
import { generateContent } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { PostJobData } from '@/shared/lib/queue/types';
import { getNextActiveTime, getPersonaId, NaverAccount } from '@/shared/lib/account-manager';
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

  const accounts = await getAllAccounts();
  if (accounts.length < 2) {
    return { success: false, jobsAdded: 0, message: '계정이 2개 이상 필요합니다' };
  }

  const cafe = inputCafeId ? await getCafeById(inputCafeId) : await getDefaultCafe();
  if (!cafe) {
    return { success: false, jobsAdded: 0, message: '카페를 찾을 수 없습니다' };
  }

  await connectDB();
  const settings = await getQueueSettings();

  // 워커 시작
  await startAllTaskWorkers();

  let jobsAdded = 0;

  // 계정별 딜레이 추적 (각 계정이 독립적으로 딜레이 관리)
  const accountDelays: Map<string, number> = new Map();

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const writerAccount = accounts[i % accounts.length];

    try {
      // AI 콘텐츠 생성
      const personaId = getPersonaId(writerAccount);
      console.log(`[QUEUE-BATCH] 계정 정보:`, JSON.stringify({ id: writerAccount.id, personaId: writerAccount.personaId }));
      console.log(`[QUEUE-BATCH] getPersonaId 반환값: ${personaId}`);
      console.log(`[QUEUE-BATCH] 콘텐츠 생성 중: ${keyword}${personaId ? ` (persona: ${personaId})` : ''}`);
      const generated = await generateContent({ keyword, service, ref, personaId });

      if (!generated.content) {
        console.error(`[QUEUE-BATCH] 콘텐츠 생성 실패: ${keyword}`);
        continue;
      }

      const { title, htmlContent } = buildCafePostContent(generated.content, keyword);

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

      // 계정별 딜레이 계산
      const currentAccountDelay = accountDelays.get(writerAccount.id) ?? 0;
      const activityDelay = getNextActiveTime(writerAccount);
      const totalDelay = Math.max(currentAccountDelay, activityDelay);

      await addTaskJob(writerAccount.id, jobData, totalDelay);
      jobsAdded++;

      // 해당 계정의 다음 글 딜레이 업데이트
      const randomDelay = getRandomDelay(settings.delays.betweenPosts);
      accountDelays.set(writerAccount.id, totalDelay + randomDelay);

      const delayInfo = activityDelay > 0
        ? `${Math.round(totalDelay / 1000)}초 (활동시간까지 ${Math.round(activityDelay / 60000)}분)`
        : `${Math.round(totalDelay / 1000)}초`;
      console.log(`[QUEUE-BATCH] Job 추가: ${keyword} → ${writerAccount.id}, 딜레이: ${delayInfo}`);
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
  const accounts = await getAllAccounts();
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
