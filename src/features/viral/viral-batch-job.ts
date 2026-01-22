'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { isAccountActive, getNextActiveTime, type NaverAccount } from '@/shared/lib/account-manager';

export interface DelayRange {
  min: number;
  max: number;
}

const getRandomDelay = (range: DelayRange): number => {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
};

import { generateViralContent, generateImages, searchRandomImages } from '@/shared/api/content-api';
import { buildViralPrompt, detectKeywordType, type KeywordType } from './viral-prompt';
import { parseViralResponse, validateParsedContent } from './viral-parser';
import { saveViralDebug } from './viral-debug';
import { addTaskJob, startAllTaskWorkers } from '@/shared/lib/queue';
import type { PostJobData, ViralCommentsData } from '@/shared/lib/queue/types';
import type { PostOptions, ProgressCallback } from '@/features/auto-comment/batch/types';
import { getRecentWriters } from '@/shared/models';

export interface DelayConfig {
  betweenPosts: DelayRange;
  betweenComments: DelayRange;
  afterPost: DelayRange;
}

export type ImageSource = 'ai' | 'search';

export interface ViralBatchInput {
  keywords: string[];
  cafeId?: string;
  postOptions?: PostOptions;
  model?: string;
  enableImage?: boolean;
  imageSource?: ImageSource;
  imageCount?: number;
  delays?: DelayConfig;
  writerAccountIds?: string[];
  commenterAccountIds?: string[];
}

export interface ViralKeywordResult {
  keyword: string;
  category?: string;
  keywordType: KeywordType;
  success: boolean;
  title?: string;
  articleId?: number;
  articleUrl?: string;
  commentCount?: number;
  replyCount?: number;
  error?: string;
}

export interface ViralBatchResult {
  success: boolean;
  totalKeywords: number;
  completed: number;
  failed: number;
  results: ViralKeywordResult[];
}

const parseKeywordInput = (input: string): { keyword: string; category?: string } => {
  const parts = input.split(':');
  if (parts.length >= 2) {
    return { keyword: parts[0].trim(), category: parts.slice(1).join(':').trim() };
  }
  return { keyword: input.trim() };
}

export const runViralBatch = async (
  input: ViralBatchInput,
  onProgress?: ProgressCallback
): Promise<ViralBatchResult> => {
  const {
    keywords,
    cafeId: inputCafeId,
    postOptions,
    model,
    enableImage,
    imageSource = 'ai',
    imageCount,
    delays,
    writerAccountIds,
    commenterAccountIds,
  } = input;

  console.log('[VIRAL] runViralBatch 시작');
  console.log('[VIRAL] 키워드 수:', keywords.length);

  const accounts = await getAllAccounts();
  if (accounts.length < 2) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: keywords.map(k => ({
        keyword: k,
        keywordType: 'own' as KeywordType,
        success: false,
        error: '계정 수 부족 (최소 2개 필요)',
      })),
    };
  }

  const cafe = inputCafeId ? await getCafeById(inputCafeId) : await getDefaultCafe();
  if (!cafe) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: keywords.map(k => ({
        keyword: k,
        keywordType: 'own' as KeywordType,
        success: false,
        error: '카페 정보 없음',
      })),
    };
  }

  await connectDB();
  await startAllTaskWorkers();

  // 최근 발행자 조회 (연속 발행 방지)
  const recentWriters = await getRecentWriters(cafe.cafeId, 3);
  console.log(`[VIRAL] 최근 발행자: ${recentWriters.join(', ') || '없음'}`);

  // 기본 딜레이 설정 (클라이언트에서 전달받지 못한 경우)
  const defaultDelays: DelayConfig = {
    betweenPosts: { min: 30000, max: 60000 },
    betweenComments: { min: 3000, max: 10000 },
    afterPost: { min: 5000, max: 15000 },
  };
  const effectiveDelays = delays || defaultDelays;

  const results: ViralKeywordResult[] = [];
  let completed = 0;
  let failed = 0;
  let globalDelay = 0;
  let lastWriterId: string | null = recentWriters[0] || null;

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, category } = parseKeywordInput(keywords[i]);
    const keywordType = detectKeywordType(keyword);

    onProgress?.({
      currentKeyword: keyword,
      keywordIndex: i,
      totalKeywords: keywords.length,
      phase: 'post',
      message: `[${i + 1}/${keywords.length}] ${keyword} 콘텐츠 생성 중...`,
    });

    try {
      const prompt = buildViralPrompt({ keyword, keywordType });
      const aiResponse = await generateViralContent({ prompt });

      if (!aiResponse.content) {
        await saveViralDebug({
          keyword,
          prompt,
          response: '',
          parseError: 'AI 응답 없음',
        });
        throw new Error('AI 응답 없음');
      }

      const parsed = parseViralResponse(aiResponse.content);

      await saveViralDebug({
        keyword,
        prompt,
        response: aiResponse.content,
        parsedTitle: parsed?.title,
        parsedBody: parsed?.body,
        parsedComments: parsed?.comments.length,
        parseError: parsed ? undefined : '파싱 실패',
      });

      if (!parsed) {
        throw new Error('응답 파싱 실패');
      }

      const validation = validateParsedContent(parsed);
      if (!validation.valid) {
        console.warn('[VIRAL] 검증 경고:', validation.errors);
      }

      // 글 작성 계정 필터링: writerAccountIds가 있으면 해당 계정만, 없으면 전체
      const writerCandidates = writerAccountIds?.length
        ? accounts.filter(a => writerAccountIds.includes(a.id) && isAccountActive(a))
        : accounts.filter(a => isAccountActive(a));

      if (writerCandidates.length === 0) {
        throw new Error('글 작성 가능한 계정 없음');
      }

      // 최근 발행자들 피해서 선택 (가능한 경우)
      let writerAccount: NaverAccount;
      if (writerCandidates.length === 1) {
        writerAccount = writerCandidates[0];
      } else {
        // 1차: 최근 발행자 전부 제외 시도
        let availableWriters = writerCandidates.filter(a => !recentWriters.includes(a.id));

        // 2차: 남은 계정이 없으면 마지막 발행자만 제외
        if (availableWriters.length === 0 && lastWriterId) {
          availableWriters = writerCandidates.filter(a => a.id !== lastWriterId);
        }

        // 3차: 그래도 없으면 전체 후보에서 선택
        if (availableWriters.length === 0) {
          availableWriters = writerCandidates;
        }

        // 키워드 인덱스 기반 순환 + 약간의 랜덤성
        const baseIndex = i % availableWriters.length;
        const randomOffset = Math.floor(Math.random() * Math.min(2, availableWriters.length));
        const writerIndex = (baseIndex + randomOffset) % availableWriters.length;
        writerAccount = availableWriters[writerIndex];
      }
      // 최근 발행자 목록 갱신
      recentWriters.unshift(writerAccount.id);
      if (recentWriters.length > 3) recentWriters.pop();
      lastWriterId = writerAccount.id;
      console.log(`[VIRAL] 글 작성자 선택: ${writerAccount.nickname || writerAccount.id} (최근: ${recentWriters.slice(0, 3).join(', ')})`);

      let menuId = cafe.menuId;
      if (category && cafe.categoryMenuIds) {
        const mappedMenuId = cafe.categoryMenuIds[category];
        if (mappedMenuId) {
          menuId = mappedMenuId;
        }
      }

      const htmlContent = convertToHtml(parsed.body);
      const writerActivityDelay = getNextActiveTime(writerAccount);
      const postDelay = Math.max(globalDelay, writerActivityDelay);

      const viralComments: ViralCommentsData = { comments: parsed.comments };
      const commentCount = parsed.comments.filter(c => c.type === 'comment').length;
      const replyCount = parsed.comments.length - commentCount;

      // 이미지 생성 (옵션이 활성화된 경우)
      let images: string[] | undefined;
      if (enableImage) {
        // imageCount가 0이면 랜덤 1~2장, 0보다 크면 고정 개수
        const finalCount = imageCount && imageCount > 0
          ? imageCount
          : Math.floor(Math.random() * 2) + 1;

        const imageSourceLabel = imageSource === 'search' ? '검색' : 'AI';
        onProgress?.({
          currentKeyword: keyword,
          keywordIndex: i,
          totalKeywords: keywords.length,
          phase: 'post',
          message: `[${i + 1}/${keywords.length}] ${keyword} ${imageSourceLabel} 이미지 ${finalCount}장...`,
        });

        try {
          const imageResult = imageSource === 'search'
            ? await searchRandomImages({ keyword, count: finalCount })
            : await generateImages({ keyword, category, count: finalCount });

          if (imageResult.success && imageResult.images?.length) {
            images = imageResult.images;
            console.log(`[VIRAL] ${imageSourceLabel} 이미지 ${images.length}장 완료: ${keyword}`);
          } else {
            console.warn(`[VIRAL] ${imageSourceLabel} 이미지 실패: ${keyword}`, imageResult.error);
          }
        } catch (imgError) {
          console.warn(`[VIRAL] ${imageSourceLabel} 이미지 오류: ${keyword}`, imgError);
        }
      }

      const postJobData: PostJobData = {
        type: 'post',
        accountId: writerAccount.id,
        cafeId: cafe.cafeId,
        menuId,
        subject: parsed.title,
        content: htmlContent,
        rawContent: parsed.body,
        category,
        keyword,
        postOptions,
        skipComments: true,
        viralComments,
        images,
        commenterAccountIds: commenterAccountIds?.length ? commenterAccountIds : undefined,
      };

      await addTaskJob(writerAccount.id, postJobData, postDelay);
      console.log(`[VIRAL] 글 발행 Job 추가: ${keyword}`);
      console.log(`[VIRAL]   - 카테고리: ${category || '기본'}`);
      console.log(`[VIRAL]   - 이미지: ${images?.length || 0}장`);
      console.log(`[VIRAL]   - 댓글: ${commentCount}개, 대댓글: ${replyCount}개`);
      console.log(`[VIRAL]   - 딜레이: ${Math.round(postDelay / 1000)}초`);

      globalDelay = postDelay + getRandomDelay(effectiveDelays.betweenPosts);

      results.push({
        keyword,
        category,
        keywordType,
        success: true,
        title: parsed.title,
        commentCount,
        replyCount,
      });
      completed++;

      onProgress?.({
        currentKeyword: keyword,
        keywordIndex: i,
        totalKeywords: keywords.length,
        phase: 'waiting',
        message: `[${i + 1}/${keywords.length}] ${keyword} Job 추가 완료`,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error(`[VIRAL] ${keyword} 처리 실패:`, errorMessage);

      results.push({
        keyword,
        category,
        keywordType,
        success: false,
        error: errorMessage,
      });
      failed++;
    }
  }

  return {
    success: failed === 0,
    totalKeywords: keywords.length,
    completed,
    failed,
    results,
  };
}

const convertToHtml = (text: string): string => {
  return text
    .split('\n')
    .map(line => {
      if (line.trim() === '') {
        return '<p><br></p>';
      }
      return `<p>${line}</p>`;
    })
    .join('');
}
