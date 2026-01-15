import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeById, getDefaultCafe } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { addTaskJob, getQueueStatus, closeAllQueues } from '@/shared/lib/queue';
import { startAllTaskWorkers, closeAllWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { generateContent, generateContentWithPrompt } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { PostJobData } from '@/shared/lib/queue/types';
import { getNextActiveTime, getPersonaId } from '@/shared/lib/account-manager';
import type { BatchJobInput } from './types';
import { parseKeywordWithCategory } from './keyword-utils';

export interface QueueBatchResult {
  success: boolean;
  jobsAdded: number;
  message: string;
}

export const addBatchToQueue = async (
  input: BatchJobInput
): Promise<QueueBatchResult> => {
  const {
    service,
    keywords,
    ref,
    cafeId: inputCafeId,
    postOptions,
    skipComments,
    contentPrompt,
    contentModel,
  } = input;

  const trimmedPrompt = contentPrompt?.trim() || '';
  const hasCustomPrompt = Boolean(trimmedPrompt);

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
  await startAllTaskWorkers();

  let jobsAdded = 0;
  const accountDelays: Map<string, number> = new Map();

  for (let i = 0; i < keywords.length; i++) {
    const keywordInput = keywords[i];
    const { keyword, category } = parseKeywordWithCategory(keywordInput);
    const keywordLabel = category ? `${keyword}:${category}` : keyword;
    const writerAccount = accounts[i % accounts.length];

    try {
      const personaId = getPersonaId(writerAccount);
      console.log(`[QUEUE-BATCH] 계정 정보:`, JSON.stringify({ id: writerAccount.id, personaId: writerAccount.personaId }));
      console.log(`[QUEUE-BATCH] getPersonaId 반환값: ${personaId}`);

      let generatedContent = '';

      if (hasCustomPrompt) {
        const prompt = `키워드: ${keyword}${category ? `\n카테고리: ${category}` : ''}\n\n${trimmedPrompt}`;
        console.log(`[QUEUE-BATCH] 커스텀 프롬프트로 콘텐츠 생성 중: ${keywordLabel}`);
        const generated = await generateContentWithPrompt({ prompt, model: contentModel });
        generatedContent = generated.content || (generated as { comment?: string }).comment || '';
      } else {
        console.log(`[QUEUE-BATCH] 콘텐츠 생성 중: ${keywordLabel}${personaId ? ` (persona: ${personaId})` : ''}`);
        const generated = await generateContent({ keyword: keywordLabel, service, ref, personaId });
        generatedContent = generated.content;
      }

      if (!generatedContent) {
        console.error(`[QUEUE-BATCH] 콘텐츠 생성 실패: ${keywordLabel}`);
        continue;
      }

      const { title, htmlContent } = buildCafePostContent(generatedContent, keywordLabel);

      const jobData: PostJobData = {
        type: 'post',
        accountId: writerAccount.id,
        cafeId: cafe.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: htmlContent,
        category,
        postOptions,
        keyword: keywordLabel,
        service,
        rawContent: generatedContent,
        skipComments,
      };

      const currentAccountDelay = accountDelays.get(writerAccount.id) ?? 0;
      const activityDelay = getNextActiveTime(writerAccount);
      const totalDelay = Math.max(currentAccountDelay, activityDelay);

      await addTaskJob(writerAccount.id, jobData, totalDelay);
      jobsAdded++;

      const randomDelay = getRandomDelay(settings.delays.betweenPosts);
      accountDelays.set(writerAccount.id, totalDelay + randomDelay);

      const delayInfo = activityDelay > 0
        ? `${Math.round(totalDelay / 1000)}초 (활동시간까지 ${Math.round(activityDelay / 60000)}분)`
        : `${Math.round(totalDelay / 1000)}초`;
      console.log(`[QUEUE-BATCH] Job 추가: ${keywordLabel} → ${writerAccount.id}, 딜레이: ${delayInfo}`);
    } catch (error) {
      console.error(`[QUEUE-BATCH] 에러: ${keywordLabel}`, error);
    }
  }

  return {
    success: jobsAdded > 0,
    jobsAdded,
    message: `${jobsAdded}개 작업이 큐에 추가됨 (${accounts.length}개 계정 병렬 처리)`,
  };
};

export const getBatchQueueStatus = async () => {
  const accounts = await getAllAccounts();
  const statuses: Record<string, { waiting: number; active: number; completed: number; failed: number }> = {};

  for (const account of accounts) {
    statuses[account.id] = await getQueueStatus(account.id);
  }

  return statuses;
};

export const stopBatchQueue = async () => {
  await closeAllWorkers();
  await closeAllQueues();
  console.log('[QUEUE-BATCH] 모든 큐/워커 종료');
};
