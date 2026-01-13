'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeById, getDefaultCafe } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { addTaskJob } from '@/shared/lib/queue';
import { startAllTaskWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { getRemainingPostsToday } from '@/shared/models';
import { buildCafePostContentFromManuscript } from '@/shared/lib/cafe-content';
import { isAccountActive } from '@/shared/lib/account-manager';
import { PostJobData } from '@/shared/lib/queue/types';
import type { ManuscriptUploadInput, ManuscriptUploadResult } from './types';

// 원고 일괄 업로드 (큐 기반)
export const runManuscriptUploadAction = async (
  input: ManuscriptUploadInput
): Promise<ManuscriptUploadResult> => {
  const { manuscripts, cafeId: inputCafeId, postOptions } = input;

  console.log('[MANUSCRIPT] 업로드 시작:', manuscripts.length, '개 원고');

  const accounts = getAllAccounts();
  if (accounts.length < 1) {
    return { success: false, jobsAdded: 0, message: '계정이 필요해' };
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
  let skipped = 0;

  // 글로벌 딜레이 (모든 계정 통합 - 동시 발행 방지)
  let globalDelay = 0;

  // 계정별 남은 포스트 수 추적
  const accountRemainingPosts: Map<string, number> = new Map();
  for (const account of accounts) {
    const remaining = await getRemainingPostsToday(account.id, account.dailyPostLimit);
    accountRemainingPosts.set(account.id, remaining);
  }

  for (let i = 0; i < manuscripts.length; i++) {
    const manuscript = manuscripts[i];
    const writerAccount = accounts[i % accounts.length];

    // 활동 시간대 체크
    if (!isAccountActive(writerAccount)) {
      console.log(`[MANUSCRIPT] ${writerAccount.id} 비활동 시간대 - 스킵`);
      skipped++;
      continue;
    }

    // 일일 포스트 제한 체크
    const remaining = accountRemainingPosts.get(writerAccount.id) ?? 0;
    if (remaining <= 0) {
      console.log(`[MANUSCRIPT] ${writerAccount.id} 일일 포스트 제한 도달 - 스킵`);
      skipped++;
      continue;
    }

    // 남은 포스트 수 감소
    accountRemainingPosts.set(writerAccount.id, remaining - 1);

    try {
      // 카테고리 → menuId 매핑
      let menuId = cafe.menuId;
      if (manuscript.category && cafe.categoryMenuIds) {
        const mappedMenuId = cafe.categoryMenuIds[manuscript.category];
        if (mappedMenuId) {
          menuId = mappedMenuId;
        }
      }

      // 원고 내용을 HTML로 변환
      const { title, htmlContent } = buildCafePostContentFromManuscript(
        manuscript.content,
        manuscript.name,
        manuscript.images
      );

      // Task Job 추가 (분리발행은 글만 발행, 댓글 없음)
      const jobData: PostJobData = {
        type: 'post',
        accountId: writerAccount.id,
        cafeId: cafe.cafeId,
        menuId,
        subject: title,
        content: htmlContent,
        postOptions,
        keyword: manuscript.name,
        service: '원고업로드',
        rawContent: manuscript.content,
        skipComments: true,
      };

      await addTaskJob(writerAccount.id, jobData, globalDelay);
      jobsAdded++;

      console.log(
        `[MANUSCRIPT] Job 추가: ${manuscript.name} (${manuscript.category || '미지정'}) → ${writerAccount.id}, 딜레이: ${Math.round(globalDelay / 1000)}초`
      );

      // 다음 글을 위한 딜레이 누적
      const randomDelay = getRandomDelay(settings.delays.betweenPosts);
      globalDelay += randomDelay;
    } catch (error) {
      console.error(`[MANUSCRIPT] 에러: ${manuscript.name}`, error);
    }
  }

  const skipMsg = skipped > 0 ? `, ${skipped}개 스킵 (제한/비활동)` : '';
  return {
    success: jobsAdded > 0,
    jobsAdded,
    message: `${jobsAdded}개 원고가 큐에 추가됨 (${accounts.length}개 계정 병렬 처리)${skipMsg}`,
  };
};
