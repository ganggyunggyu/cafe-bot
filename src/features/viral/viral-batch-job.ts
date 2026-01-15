'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { isAccountActive, getNextActiveTime, type NaverAccount } from '@/shared/lib/account-manager';
import { generateViralContent } from '@/shared/api/content-api';
import { buildViralPrompt, detectKeywordType, type KeywordType } from './viral-prompt';
import { parseViralResponse, validateParsedContent } from './viral-parser';
import { saveViralDebug } from './viral-debug';
import { addTaskJob, startAllTaskWorkers } from '@/shared/lib/queue';
import type { PostJobData, ViralCommentsData } from '@/shared/lib/queue/types';
import type { PostOptions, ProgressCallback } from '@/features/auto-comment/batch/types';

export interface ViralBatchInput {
  keywords: string[];
  cafeId?: string;
  postOptions?: PostOptions;
  model?: string;
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
  const { keywords, cafeId: inputCafeId, postOptions, model } = input;

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
  const settings = await getQueueSettings();
  await startAllTaskWorkers();

  const results: ViralKeywordResult[] = [];
  let completed = 0;
  let failed = 0;
  let globalDelay = 0;
  let lastWriterId: string | null = null;

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

      const activeAccounts = accounts.filter(a => isAccountActive(a));
      if (activeAccounts.length === 0) {
        throw new Error('활동 가능한 계정 없음');
      }

      // 라운드 로빈 + 랜덤: 마지막 글쓴이 제외하고 선택
      let writerAccount: NaverAccount;
      if (activeAccounts.length === 1) {
        writerAccount = activeAccounts[0];
      } else {
        const availableWriters: NaverAccount[] = lastWriterId
          ? activeAccounts.filter(a => a.id !== lastWriterId)
          : activeAccounts;
        // 키워드 인덱스 기반 순환 + 약간의 랜덤성
        const baseIndex = i % availableWriters.length;
        const randomOffset = Math.floor(Math.random() * Math.min(2, availableWriters.length));
        const writerIndex = (baseIndex + randomOffset) % availableWriters.length;
        writerAccount = availableWriters[writerIndex];
      }
      lastWriterId = writerAccount.id;

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

      const postJobData: PostJobData = {
        type: 'post',
        accountId: writerAccount.id,
        cafeId: cafe.cafeId,
        menuId,
        subject: parsed.title,
        content: htmlContent,
        rawContent: parsed.body,
        keyword,
        postOptions,
        skipComments: true,
        viralComments,
      };

      await addTaskJob(writerAccount.id, postJobData, postDelay);
      console.log(`[VIRAL] 글 발행 Job 추가: ${keyword}, 딜레이: ${Math.round(postDelay / 1000)}초`);
      console.log(`[VIRAL] 댓글 ${commentCount}개, 대댓글 ${replyCount}개 데이터 포함`);

      globalDelay = postDelay + getRandomDelay(settings.delays.betweenPosts);

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
