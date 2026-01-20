'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { isAccountActive, getNextActiveTime, type NaverAccount } from '@/shared/lib/account-manager';
import { addTaskJob, startAllTaskWorkers } from '@/shared/lib/queue';
import type { PostJobData } from '@/shared/lib/queue/types';
import type { ProgressCallback } from '@/features/auto-comment/batch/types';
import type {
  ManualPublishInput,
  ManualPublishResult,
  ManuscriptResult,
  ManuscriptFolder,
} from './types';

export const runManualPublish = async (
  input: ManualPublishInput,
  onProgress?: ProgressCallback
): Promise<ManualPublishResult> => {
  const { manuscripts, cafeId: inputCafeId, postOptions } = input;

  console.log('[MANUAL] runManualPublish 시작');
  console.log('[MANUAL] 원고 수:', manuscripts.length);

  const accounts = await getAllAccounts();
  if (accounts.length === 0) {
    return {
      success: false,
      totalManuscripts: manuscripts.length,
      completed: 0,
      failed: manuscripts.length,
      results: manuscripts.map((m) => ({
        folderName: m.folderName,
        title: m.title,
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
        title: m.title,
        success: false,
        error: '카페 정보 없음',
      })),
    };
  }

  await connectDB();
  const settings = await getQueueSettings();
  await startAllTaskWorkers();

  const results: ManuscriptResult[] = [];
  let completed = 0;
  let failed = 0;
  let globalDelay = 0;
  let lastWriterId: string | null = null;

  for (let i = 0; i < manuscripts.length; i++) {
    const manuscript = manuscripts[i];

    onProgress?.({
      currentKeyword: manuscript.title,
      keywordIndex: i,
      totalKeywords: manuscripts.length,
      phase: 'post',
      message: `[${i + 1}/${manuscripts.length}] ${manuscript.folderName} 발행 준비 중...`,
    });

    try {
      const activeAccounts = accounts.filter((a) => isAccountActive(a));
      if (activeAccounts.length === 0) {
        throw new Error('활동 가능한 계정 없음');
      }

      // 라운드 로빈 + 랜덤: 마지막 글쓴이 제외하고 선택
      let writerAccount: NaverAccount;
      if (activeAccounts.length === 1) {
        writerAccount = activeAccounts[0];
      } else {
        const availableWriters = lastWriterId
          ? activeAccounts.filter((a) => a.id !== lastWriterId)
          : activeAccounts;
        const baseIndex = i % availableWriters.length;
        const randomOffset = Math.floor(Math.random() * Math.min(2, availableWriters.length));
        const writerIndex = (baseIndex + randomOffset) % availableWriters.length;
        writerAccount = availableWriters[writerIndex];
      }
      lastWriterId = writerAccount.id;

      let menuId = cafe.menuId;
      if (manuscript.category && cafe.categoryMenuIds) {
        const mappedMenuId = cafe.categoryMenuIds[manuscript.category];
        if (mappedMenuId) {
          menuId = mappedMenuId;
        }
      }

      const writerActivityDelay = getNextActiveTime(writerAccount);
      const postDelay = Math.max(globalDelay, writerActivityDelay);

      const postJobData: PostJobData = {
        type: 'post',
        accountId: writerAccount.id,
        cafeId: cafe.cafeId,
        menuId,
        subject: manuscript.title,
        content: manuscript.htmlContent,
        rawContent: manuscript.body,
        category: manuscript.category,
        keyword: manuscript.folderName,
        postOptions,
        skipComments: true,
        images: manuscript.images.length > 0 ? manuscript.images : undefined,
      };

      await addTaskJob(writerAccount.id, postJobData, postDelay);
      console.log(`[MANUAL] 글 발행 Job 추가: ${manuscript.folderName}`);
      console.log(`[MANUAL]   - 제목: ${manuscript.title}`);
      console.log(`[MANUAL]   - 이미지: ${manuscript.images.length}장`);
      console.log(`[MANUAL]   - 딜레이: ${Math.round(postDelay / 1000)}초`);

      globalDelay = postDelay + getRandomDelay(settings.delays.betweenPosts);

      results.push({
        folderName: manuscript.folderName,
        title: manuscript.title,
        success: true,
      });
      completed++;

      onProgress?.({
        currentKeyword: manuscript.title,
        keywordIndex: i,
        totalKeywords: manuscripts.length,
        phase: 'waiting',
        message: `[${i + 1}/${manuscripts.length}] ${manuscript.folderName} Job 추가 완료`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error(`[MANUAL] ${manuscript.folderName} 처리 실패:`, errorMessage);

      results.push({
        folderName: manuscript.folderName,
        title: manuscript.title,
        success: false,
        error: errorMessage,
      });
      failed++;
    }
  }

  return {
    success: failed === 0,
    totalManuscripts: manuscripts.length,
    completed,
    failed,
    results,
  };
};
