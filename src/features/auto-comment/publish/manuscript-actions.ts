'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeById, getDefaultCafe } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { addTaskJob } from '@/shared/lib/queue';
import { startAllTaskWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { getRemainingPostsToday, PublishedArticle, ModifiedArticle } from '@/shared/models';
import { buildCafePostContentFromManuscript } from '@/shared/lib/cafe-content';
import { isAccountActive } from '@/shared/lib/account-manager';
import { PostJobData } from '@/shared/lib/queue/types';
import { modifyArticleWithAccount } from '../batch/article-modifier';
import { buildBaseFilter, fetchArticlesToModify } from '../batch/modify-query-utils';
import type {
  ManuscriptUploadInput,
  ManuscriptUploadResult,
  ManuscriptModifyInput,
  ManuscriptModifyResult,
  ManuscriptModifyArticleResult,
} from './types';

// 원고 일괄 업로드 (큐 기반)
export const runManuscriptUploadAction = async (
  input: ManuscriptUploadInput
): Promise<ManuscriptUploadResult> => {
  const { manuscripts, cafeId: inputCafeId, postOptions } = input;

  console.log('[MANUSCRIPT] 업로드 시작:', manuscripts.length, '개 원고');

  const accounts = await getAllAccounts();
  if (accounts.length < 1) {
    return { success: false, jobsAdded: 0, message: '계정이 필요합니다' };
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

// 원고로 기존 글 수정 (직접 실행)
export const runManuscriptModifyAction = async (
  input: ManuscriptModifyInput
): Promise<ManuscriptModifyResult> => {
  const { manuscripts, cafeId: inputCafeId, sortOrder = 'oldest', daysLimit } = input;

  console.log('[MANUSCRIPT MODIFY] 수정 시작:', manuscripts.length, '개 원고');

  const accounts = await getAllAccounts();
  if (accounts.length === 0) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
      message: '계정이 필요합니다',
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
      message: '카페를 찾을 수 없습니다',
    };
  }

  await connectDB();

  // 수정 대상 글 조회 (원고 개수만큼)
  const baseFilter = buildBaseFilter(cafe.cafeId, daysLimit);
  const articlesToModify = await fetchArticlesToModify(sortOrder, manuscripts.length, baseFilter);

  if (articlesToModify.length === 0) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
      message: '수정 가능한 글이 없습니다 (발행된 글이 없거나 이미 수정됨)',
    };
  }

  console.log(`[MANUSCRIPT MODIFY] 수정 대상: ${articlesToModify.length}개 글`);

  const results: ManuscriptModifyArticleResult[] = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < articlesToModify.length; i++) {
    const article = articlesToModify[i];
    const manuscript = manuscripts[i];
    const { articleId, writerAccountId, keyword } = article;

    // 글 작성자 계정 찾기
    const writerAccount = accounts.find((a) => a.id === writerAccountId);

    if (!writerAccount) {
      console.log(`[MANUSCRIPT MODIFY] 작성자 계정(${writerAccountId}) 없음 - 스킵`);
      results.push({
        articleId,
        keyword,
        manuscriptName: manuscript.name,
        success: false,
        error: `작성자 계정(${writerAccountId}) 없음`,
      });
      failed++;
      continue;
    }

    try {
      // 원고 → HTML 변환
      const { title: newTitle, htmlContent: newContent } = buildCafePostContentFromManuscript(
        manuscript.content,
        manuscript.name,
        manuscript.images
      );

      // 글 수정 실행
      const modifyResult = await modifyArticleWithAccount(writerAccount, {
        cafeId: cafe.cafeId,
        articleId,
        newTitle,
        newContent,
        category: manuscript.category,
      });

      if (!modifyResult.success) {
        results.push({
          articleId,
          keyword,
          manuscriptName: manuscript.name,
          success: false,
          error: modifyResult.error || '수정 실패',
        });
        failed++;
        continue;
      }

      // ModifiedArticle 저장
      await ModifiedArticle.create({
        originalArticleId: article._id,
        articleId,
        cafeId: cafe.cafeId,
        keyword: manuscript.name,
        newTitle,
        newContent,
        modifiedAt: new Date(),
        modifiedBy: writerAccountId,
      });

      // PublishedArticle에서 제거
      await PublishedArticle.deleteOne({ _id: article._id });

      results.push({
        articleId,
        keyword,
        manuscriptName: manuscript.name,
        success: true,
      });
      completed++;

      console.log(
        `[MANUSCRIPT MODIFY] 수정 완료: ${manuscript.name} → ${articleId} (${i + 1}/${articlesToModify.length})`
      );

      // 다음 글 수정 전 대기 (30초)
      if (i < articlesToModify.length - 1) {
        console.log('[MANUSCRIPT MODIFY] 다음 글 수정 전 30초 대기...');
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error(`[MANUSCRIPT MODIFY] 에러: ${manuscript.name}`, error);
      results.push({
        articleId,
        keyword,
        manuscriptName: manuscript.name,
        success: false,
        error: errorMessage,
      });
      failed++;
    }
  }

  return {
    success: failed === 0,
    totalArticles: articlesToModify.length,
    completed,
    failed,
    results,
    message: `${completed}개 수정 완료, ${failed}개 실패`,
  };
};
