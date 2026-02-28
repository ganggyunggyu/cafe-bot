'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getCurrentUserId } from '@/shared/config/user';
import { getDefaultCafe, getCafeById, type CafeConfig } from '@/shared/config/cafes';
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
import { buildViralPrompt, detectKeywordType, type KeywordType, type ContentStyle } from './viral-prompt';
import { parseViralResponse, validateParsedContent } from './viral-parser';
import { saveViralDebug } from './viral-debug';
import { addTaskJob, startAllTaskWorkers } from '@/shared/lib/queue';
import type { PostJobData, ViralCommentsData } from '@/shared/lib/queue/types';
import type { PostOptions, ProgressCallback } from '@/features/auto-comment/batch/types';
import { getRecentWriters, User } from '@/shared/models';

export interface DelayConfig {
  betweenPosts: DelayRange;
  betweenComments: DelayRange;
  afterPost: DelayRange;
}

export type ImageSource = 'ai' | 'search';

export interface ViralBatchInput {
  keywords: string[];
  cafeId?: string;
  cafeIds?: string[];
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

const VALID_STYLES: ContentStyle[] = ['정보', '일상', '애니'];
const DEFAULT_STYLE: ContentStyle = '일상';

const STYLE_ALIASES: Record<string, ContentStyle> = {
  '자사키워드': '정보',
  '자사': '정보',
  '광고': '정보',
};

const resolveStyle = (raw: string): ContentStyle | null => {
  const trimmed = raw.trim();
  if (VALID_STYLES.includes(trimmed as ContentStyle)) return trimmed as ContentStyle;
  if (trimmed in STYLE_ALIASES) return STYLE_ALIASES[trimmed];
  return null;
};

const parseKeywordInput = (input: string): { keyword: string; category?: string; style: ContentStyle } => {
  const parts = input.split(':');
  if (parts.length >= 3) {
    const style = resolveStyle(parts[parts.length - 1]) ?? DEFAULT_STYLE;
    const category = parts.slice(1, -1).join(':').trim() || undefined;
    return { keyword: parts[0].trim(), category, style };
  }
  if (parts.length === 2) {
    const second = parts[1].trim();
    const style = resolveStyle(second);
    if (style) return { keyword: parts[0].trim(), style };
    return { keyword: parts[0].trim(), category: second, style: DEFAULT_STYLE };
  }
  return { keyword: input.trim(), style: DEFAULT_STYLE };
};

export const runViralBatch = async (
  input: ViralBatchInput,
  onProgress?: ProgressCallback
): Promise<ViralBatchResult> => {
  const {
    keywords,
    cafeId: inputCafeId,
    cafeIds: inputCafeIds,
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

  const userId = await getCurrentUserId();
  console.log('[VIRAL] userId:', userId);

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

  const user = await User.findOne({ userId }, { loginId: 1 }).lean();
  console.log('[VIRAL] user:', { loginId: user?.loginId });

  // 다중 카페 지원: cafeIds > cafeId > defaultCafe 순으로 우선순위
  let cafes: CafeConfig[] = [];
  if (inputCafeIds?.length) {
    const cafePromises = inputCafeIds.map((id) => getCafeById(id));
    const cafeResults = await Promise.all(cafePromises);
    cafes = cafeResults.filter((c): c is CafeConfig => c !== null);
  } else if (inputCafeId) {
    const cafe = await getCafeById(inputCafeId);
    if (cafe) cafes = [cafe];
  } else {
    const defaultCafe = await getDefaultCafe();
    if (defaultCafe) cafes = [defaultCafe];
  }

  if (cafes.length === 0) {
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

  console.log(`[VIRAL] 대상 카페: ${cafes.map((c) => c.name).join(', ')}`);

  await connectDB();
  await startAllTaskWorkers();

  // 카페별 최근 발행자 조회 (연속 발행 방지)
  const recentWritersMap = new Map<string, string[]>();
  for (const cafe of cafes) {
    const recentWriters = await getRecentWriters(cafe.cafeId, 3);
    recentWritersMap.set(cafe.cafeId, recentWriters);
    console.log(`[VIRAL] ${cafe.name} 최근 발행자: ${recentWriters.join(', ') || '없음'}`);
  }

  // 기본 딜레이 설정 (클라이언트에서 전달받지 못한 경우)
  const defaultDelays: DelayConfig = {
    betweenPosts: { min: 30000, max: 60000 },
    betweenComments: { min: 3 * 60 * 1000, max: 8 * 60 * 1000 },
    afterPost: { min: 5000, max: 15000 },
  };
  const effectiveDelays = delays || defaultDelays;

  // 키워드별 대상 카페 매칭 함수
  const getTargetCafes = (category: string | undefined): CafeConfig[] => {
    if (!category) return cafes; // 카테고리 없으면 모든 카페

    return cafes.filter((cafe) => {
      // 1. 직접 카테고리 존재
      if (cafe.categories.includes(category)) return true;
      // 2. alias에 해당 카테고리가 있음 (다른 카페 카테고리 → 이 카페로 매핑)
      if (cafe.categoryAliases && category in cafe.categoryAliases) return true;
      return false;
    });
  };

  // 총 작업 수 계산 (키워드별 대상 카페 수 합산)
  let totalTasks = 0;
  for (const kw of keywords) {
    const { category } = parseKeywordInput(kw);
    totalTasks += getTargetCafes(category).length;
  }

  const results: ViralKeywordResult[] = [];
  let completed = 0;
  let failed = 0;
  let globalDelay = 0;
  const lastWriterIdMap = new Map<string, string | null>();
  cafes.forEach((cafe) => {
    const recentWriters = recentWritersMap.get(cafe.cafeId) || [];
    lastWriterIdMap.set(cafe.cafeId, recentWriters[0] || null);
  });

  let taskIndex = 0;

  // ====== 계정별 키워드 균등 배분 ======
  const allParsedKeywords = keywords.map((kw, idx) => {
    const parsed = parseKeywordInput(kw);
    return { ...parsed, index: idx, keywordType: detectKeywordType(parsed.keyword) };
  });

  const writerCandidatesAll = writerAccountIds?.length
    ? accounts.filter((a) => writerAccountIds.includes(a.id) && isAccountActive(a))
    : accounts.filter((a) => isAccountActive(a));

  const accountAssignments = new Map<string, string>();

  if (writerCandidatesAll.length > 0) {
    for (const cafe of cafes) {
      const cafeRecentWriters = recentWritersMap.get(cafe.cafeId) || [];
      const cafeKeywords = allParsedKeywords.filter((pk) =>
        getTargetCafes(pk.category).some((t) => t.cafeId === cafe.cafeId)
      );

      // 스타일별 그룹핑 (광고=정보, 일상, 기타)
      const adKeywords = cafeKeywords.filter((k) => k.style === '정보');
      const dailyKeywords = cafeKeywords.filter((k) => k.style === '일상');
      const otherKeywords = cafeKeywords.filter((k) => !['정보', '일상'].includes(k.style));

      // 최근 발행자가 아닌 계정 우선 정렬
      const sortedWriters = [...writerCandidatesAll].sort((a, b) => {
        const ai = cafeRecentWriters.indexOf(a.id);
        const bi = cafeRecentWriters.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return -1;
        if (bi === -1) return 1;
        return bi - ai;
      });

      // 라운드로빈 균등 배분
      const assignGroup = (group: typeof cafeKeywords) => {
        for (let gi = 0; gi < group.length; gi++) {
          const account = sortedWriters[gi % sortedWriters.length];
          accountAssignments.set(`${group[gi].index}-${cafe.cafeId}`, account.id);
        }
      };

      assignGroup(adKeywords);
      assignGroup(dailyKeywords);
      assignGroup(otherKeywords);

      // 배분 결과 로깅
      const distribution = new Map<string, { ad: number; daily: number; other: number }>();
      sortedWriters.forEach((a) => distribution.set(a.nickname || a.id, { ad: 0, daily: 0, other: 0 }));

      for (const [key, accountId] of accountAssignments) {
        if (!key.endsWith(`-${cafe.cafeId}`)) continue;
        const kwIdx = parseInt(key.split('-')[0]);
        const pk = allParsedKeywords[kwIdx];
        const acc = sortedWriters.find((a) => a.id === accountId);
        const name = acc?.nickname || accountId;
        const dist = distribution.get(name);
        if (!dist) continue;
        if (pk.style === '정보') dist.ad++;
        else if (pk.style === '일상') dist.daily++;
        else dist.other++;
      }

      console.log(`[VIRAL] ${cafe.name} 계정별 키워드 배분:`);
      for (const [name, counts] of distribution) {
        const parts = [];
        if (counts.ad > 0) parts.push(`광고 ${counts.ad}개`);
        if (counts.daily > 0) parts.push(`일상 ${counts.daily}개`);
        if (counts.other > 0) parts.push(`기타 ${counts.other}개`);
        if (parts.length > 0) {
          console.log(`[VIRAL]   ${name}: ${parts.join(', ')}`);
        }
      }
    }
  }

  for (let i = 0; i < keywords.length; i++) {
    const { keyword, category, style } = parseKeywordInput(keywords[i]);
    const keywordType = detectKeywordType(keyword);
    const targetCafes = getTargetCafes(category);

    if (targetCafes.length === 0) {
      console.warn(`[VIRAL] ${keyword} (${category}) - 대상 카페 없음, 스킵`);
      continue;
    }

    // AI 콘텐츠는 키워드당 1회만 생성 (모든 카페에 동일 콘텐츠 사용)
    onProgress?.({
      currentKeyword: keyword,
      keywordIndex: taskIndex,
      totalKeywords: totalTasks,
      phase: 'post',
      message: `[${taskIndex + 1}/${totalTasks}] ${keyword} (${style}) 콘텐츠 생성 중...`,
    });

    let parsed: Awaited<ReturnType<typeof parseViralResponse>> | null = null;
    let images: string[] | undefined;

    try {
      const prompt = buildViralPrompt({ keyword, keywordType, contentType: style === '일상' ? 'lifestyle' : undefined }, style);
      const aiResponse = await generateViralContent({ prompt, model });

      if (!aiResponse.content) {
        await saveViralDebug({
          keyword,
          prompt,
          response: '',
          parseError: 'AI 응답 없음',
          cafeId: cafes[0].cafeId,
          contentStyle: style,
        });
        throw new Error('AI 응답 없음');
      }

      parsed = parseViralResponse(aiResponse.content);

      await saveViralDebug({
        keyword,
        prompt,
        response: aiResponse.content,
        parsedTitle: parsed?.title,
        parsedBody: parsed?.body,
        parsedComments: parsed?.comments.length,
        parseError: parsed ? undefined : '파싱 실패',
        cafeId: cafes[0].cafeId,
        contentStyle: style,
      });

      if (!parsed) {
        throw new Error('응답 파싱 실패');
      }

      const validation = validateParsedContent(parsed);
      if (!validation.valid) {
        console.warn('[VIRAL] 검증 경고:', validation.errors);
      }

      // 이미지 생성 (옵션이 활성화된 경우) - 키워드당 1회만
      if (enableImage) {
        const finalCount = imageCount && imageCount > 0
          ? imageCount
          : Math.floor(Math.random() * 2) + 1;

        const imageSourceLabel = imageSource === 'search' ? '검색' : 'AI';
        onProgress?.({
          currentKeyword: keyword,
          keywordIndex: taskIndex,
          totalKeywords: totalTasks,
          phase: 'post',
          message: `[${taskIndex + 1}/${totalTasks}] ${keyword} ${imageSourceLabel} 이미지 ${finalCount}장...`,
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
    } catch (error) {
      // 콘텐츠 생성 실패 시 모든 카페에 대해 실패 처리
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error(`[VIRAL] ${keyword} 콘텐츠 생성 실패:`, errorMessage);

      for (const cafe of targetCafes) {
        results.push({
          keyword: targetCafes.length > 1 ? `${keyword} (${cafe.name})` : keyword,
          category,
          keywordType,
          success: false,
          error: errorMessage,
        });
        failed++;
        taskIndex++;

        onProgress?.({
          currentKeyword: keyword,
          keywordIndex: taskIndex - 1,
          totalKeywords: totalTasks,
          phase: 'done',
          message: `[${taskIndex}/${totalTasks}] ${keyword} (${cafe.name}) 실패`,
          success: false,
          error: errorMessage,
        });
      }
      continue;
    }

    // 대상 카페에만 발행
    for (const cafe of targetCafes) {
      const recentWriters = recentWritersMap.get(cafe.cafeId) || [];
      const lastWriterId = lastWriterIdMap.get(cafe.cafeId);

      try {
        // 사전 배분된 계정 사용
        const assignmentKey = `${i}-${cafe.cafeId}`;
        const assignedAccountId = accountAssignments.get(assignmentKey);
        let writerAccount: NaverAccount;

        if (assignedAccountId) {
          const assigned = accounts.find((a) => a.id === assignedAccountId);
          if (assigned && isAccountActive(assigned)) {
            writerAccount = assigned;
          } else {
            const fallback = writerCandidatesAll.find((a) => a.id !== assignedAccountId) || writerCandidatesAll[0];
            if (!fallback) throw new Error('글 작성 가능한 계정 없음');
            writerAccount = fallback;
            console.warn(`[VIRAL] 배분 계정(${assignedAccountId}) 비활성 → ${writerAccount.nickname || writerAccount.id} 대체`);
          }
        } else {
          if (writerCandidatesAll.length === 0) throw new Error('글 작성 가능한 계정 없음');
          writerAccount = writerCandidatesAll[i % writerCandidatesAll.length];
          console.warn(`[VIRAL] 배분 없음 → ${writerAccount.nickname || writerAccount.id} 대체 사용`);
        }

        // 최근 발행자 목록 갱신
        recentWriters.unshift(writerAccount.id);
        if (recentWriters.length > 3) recentWriters.pop();
        lastWriterIdMap.set(cafe.cafeId, writerAccount.id);
        console.log(`[VIRAL] ${cafe.name} 글 작성자: ${writerAccount.nickname || writerAccount.id}`);

        let menuId = cafe.menuId;
        if (category && cafe.categoryMenuIds) {
          // 1. 직접 매핑 먼저 시도
          let mappedMenuId = cafe.categoryMenuIds[category];

          // 2. 없으면 alias로 변환 후 다시 시도
          if (!mappedMenuId && cafe.categoryAliases) {
            const aliasedCategory = cafe.categoryAliases[category];
            if (aliasedCategory) {
              mappedMenuId = cafe.categoryMenuIds[aliasedCategory];
              console.log(`[VIRAL] ${cafe.name} 카테고리 alias: ${category} → ${aliasedCategory}`);
            }
          }

          if (mappedMenuId) {
            menuId = mappedMenuId;
          }
        }

        const htmlContent = convertToHtml(parsed!.body);
        const writerActivityDelay = getNextActiveTime(writerAccount);
        const postDelay = Math.max(globalDelay, writerActivityDelay);

        const viralComments: ViralCommentsData = { comments: parsed!.comments };
        const commentCount = parsed!.comments.filter(c => c.type === 'comment').length;
        const replyCount = parsed!.comments.length - commentCount;

        const postJobData: PostJobData = {
          type: 'post',
          accountId: writerAccount.id,
          userId,
          cafeId: cafe.cafeId,
          menuId,
          subject: parsed!.title,
          content: htmlContent,
          rawContent: parsed!.body,
          category,
          keyword,
          postOptions,
          skipComments: true,
          viralComments,
          images,
          commenterAccountIds: commenterAccountIds?.length ? commenterAccountIds : undefined,
        };

        await addTaskJob(writerAccount.id, postJobData, postDelay);
        console.log(`[VIRAL] ${cafe.name} 글 발행 Job 추가: ${keyword}`);
        console.log(`[VIRAL]   - 딜레이: ${Math.round(postDelay / 1000)}초`);

        globalDelay = postDelay + getRandomDelay(effectiveDelays.betweenPosts);

        results.push({
          keyword: targetCafes.length > 1 ? `${keyword} (${cafe.name})` : keyword,
          category,
          keywordType,
          success: true,
          title: parsed!.title,
          commentCount,
          replyCount,
        });
        completed++;
        taskIndex++;

        onProgress?.({
          currentKeyword: keyword,
          keywordIndex: taskIndex - 1,
          totalKeywords: totalTasks,
          phase: 'done',
          message: `[${taskIndex}/${totalTasks}] ${keyword} (${cafe.name}) 완료`,
          success: true,
          title: parsed!.title,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        console.error(`[VIRAL] ${keyword} (${cafe.name}) 발행 실패:`, errorMessage);

        results.push({
          keyword: targetCafes.length > 1 ? `${keyword} (${cafe.name})` : keyword,
          category,
          keywordType,
          success: false,
          error: errorMessage,
        });
        failed++;
        taskIndex++;

        onProgress?.({
          currentKeyword: keyword,
          keywordIndex: taskIndex - 1,
          totalKeywords: totalTasks,
          phase: 'done',
          message: `[${taskIndex}/${totalTasks}] ${keyword} (${cafe.name}) 실패`,
          success: false,
          error: errorMessage,
        });
      }
    }
  }

  return {
    success: failed === 0,
    totalKeywords: totalTasks,
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
