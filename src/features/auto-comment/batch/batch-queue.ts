import { getAllAccounts } from '@/shared/config/accounts';
import { addTaskJob, getQueueStatus, closeAllQueues } from '@/shared/lib/queue';
import { closeAllWorkers } from '@/shared/lib/queue/workers';
import { getRandomDelay } from '@/shared/models/queue-settings';
import { generateContent, generateContentWithPrompt } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { warmupScheduleSessions } from '@/shared/lib/multi-session';
import { PostJobData } from '@/shared/lib/queue/types';
import { getNextActiveTime, getPersonaId, type NaverAccount } from '@/shared/lib/account-manager';
import type { BatchJobInput } from './types';
import { parseKeywordWithCategory } from './keyword-utils';
import { initBatchContext, isBatchContextError } from './batch-helpers';

export interface QueueBatchResult {
  success: boolean;
  jobsAdded: number;
  message: string;
}

const POST_ONLY_RESERVATION_BUFFER_MS = 20 * 60 * 1000;
const COMMENT_RESERVATION_BUFFER_MS = 90 * 60 * 1000;

type ReservationDelaySettings = {
  delays: {
    betweenPosts: { min: number; max: number };
    afterPost: { min: number; max: number };
    betweenComments: { min: number; max: number };
  };
};

const getScheduledAccounts = (
  accounts: NaverAccount[],
  keywordCount: number,
  includeCommenters: boolean
): NaverAccount[] => {
  if (includeCommenters) {
    return accounts;
  }

  const scheduledAccounts: NaverAccount[] = [];
  const seenAccountIds = new Set<string>();

  for (let i = 0; i < keywordCount; i++) {
    const account = accounts[i % accounts.length];
    if (!account || seenAccountIds.has(account.id)) continue;

    seenAccountIds.add(account.id);
    scheduledAccounts.push(account);
  }

  return scheduledAccounts;
};

const estimateReservationTtlMs = (
  accounts: NaverAccount[],
  keywordCount: number,
  includeCommenters: boolean,
  settings: ReservationDelaySettings
): number => {
  const accountDelays: Map<string, number> = new Map();
  let maxScheduledDelay = 0;

  for (let i = 0; i < keywordCount; i++) {
    const writerAccount = accounts[i % accounts.length];
    if (!writerAccount) continue;

    const currentAccountDelay = accountDelays.get(writerAccount.id) ?? 0;
    const activityDelay = getNextActiveTime(writerAccount);
    const totalDelay = Math.max(currentAccountDelay, activityDelay);

    maxScheduledDelay = Math.max(maxScheduledDelay, totalDelay);
    accountDelays.set(
      writerAccount.id,
      totalDelay + settings.delays.betweenPosts.max
    );
  }

  const chainBufferMs = includeCommenters
    ? Math.max(
        COMMENT_RESERVATION_BUFFER_MS,
        settings.delays.afterPost.max +
          settings.delays.betweenComments.max * Math.max(accounts.length, 1) * 3
      )
    : POST_ONLY_RESERVATION_BUFFER_MS;

  return maxScheduledDelay + chainBufferMs;
};

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

  const ctx = await initBatchContext(inputCafeId, 2);
  if (isBatchContextError(ctx)) {
    return { success: false, jobsAdded: 0, message: ctx.error };
  }

  const { accounts, cafe, settings } = ctx;
  const scheduledAccounts = getScheduledAccounts(
    accounts,
    keywords.length,
    !skipComments
  );
  const reservationTtlMs = estimateReservationTtlMs(
    accounts,
    keywords.length,
    !skipComments,
    settings
  );

  const warmupResult = await warmupScheduleSessions(scheduledAccounts, {
    reason: `batch_queue_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    reservationTtlMs,
  });

  if (!warmupResult.success) {
    return {
      success: false,
      jobsAdded: 0,
      message: `세션 프리워밍 실패: ${warmupResult.failedAccountId || 'unknown'} - ${
        warmupResult.error || '로그인 실패'
      }`,
    };
  }

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
    message: `${jobsAdded}개 작업이 큐에 추가됨 (${scheduledAccounts.length}개 계정 세션 준비 완료)`,
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
