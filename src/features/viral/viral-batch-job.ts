'use server';

import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { isAccountActive, getNextActiveTime, getPersonaId } from '@/shared/lib/account-manager';
import { generateViralContent } from '@/shared/api/content-api';
import { buildViralPrompt, detectKeywordType, type KeywordType } from './viral-prompt';
import { parseViralResponse, validateParsedContent, type ParsedComment, type ParsedViralContent } from './viral-parser';
import { saveViralDebug } from './viral-debug';
import { addTaskJob, startAllTaskWorkers } from '@/shared/lib/queue';
import type { PostJobData, CommentJobData, ReplyJobData } from '@/shared/lib/queue/types';
import type { PostOptions, BatchProgress, ProgressCallback } from '@/features/auto-comment/batch/types';

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
      const writerAccount = activeAccounts[Math.floor(Math.random() * activeAccounts.length)];

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
      };

      await addTaskJob(writerAccount.id, postJobData, postDelay);
      console.log(`[VIRAL] 글 발행 Job 추가: ${keyword}, 딜레이: ${Math.round(postDelay / 1000)}초`);

      const { commentCount, replyCount } = await addCommentJobs({
        parsed,
        accounts,
        writerAccountId: writerAccount.id,
        cafeId: cafe.cafeId,
        keyword,
        postDelay,
        settings,
      });

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

interface AddCommentJobsParams {
  parsed: ParsedViralContent;
  accounts: Awaited<ReturnType<typeof getAllAccounts>>;
  writerAccountId: string;
  cafeId: string;
  keyword: string;
  postDelay: number;
  settings: Awaited<ReturnType<typeof getQueueSettings>>;
}

const addCommentJobs = async (params: AddCommentJobsParams): Promise<{ commentCount: number; replyCount: number }> => {
  const { parsed, accounts, writerAccountId, cafeId, keyword, postDelay, settings } = params;

  const mainComments = parsed.comments.filter(c => c.type === 'comment');
  const replies = parsed.comments.filter(c => c.type !== 'comment');

  const commenterAccounts = accounts.filter(a => a.id !== writerAccountId);
  if (commenterAccounts.length === 0) {
    console.log('[VIRAL] 댓글 계정 없음');
    return { commentCount: 0, replyCount: 0 };
  }

  let commentDelay = postDelay + getRandomDelay(settings.delays.afterPost);
  let commentCount = 0;
  let replyCount = 0;

  const commentIndexMap: Map<number, number> = new Map();
  const commentAuthorMap: Map<number, string> = new Map();

  for (let i = 0; i < mainComments.length; i++) {
    const comment = mainComments[i];
    const commenter = commenterAccounts[i % commenterAccounts.length];
    const activityDelay = getNextActiveTime(commenter);
    const currentDelay = Math.max(commentDelay, activityDelay);

    const commentJobData: CommentJobData = {
      type: 'comment',
      accountId: commenter.id,
      cafeId,
      articleId: 0,
      content: comment.content,
      keyword,
    };

    await addTaskJob(commenter.id, commentJobData, currentDelay);
    commentIndexMap.set(comment.index, i);
    commentAuthorMap.set(comment.index, commenter.id);
    commentDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
    commentCount++;
  }

  let replyDelay = commentDelay + getRandomDelay(settings.delays.afterPost);

  const lastReplyerByParent: Map<number, string> = new Map();

  for (const reply of replies) {
    const parentCommentOrder = commentIndexMap.get(reply.parentIndex!);
    if (parentCommentOrder === undefined) continue;

    const parentCommenterId = commentAuthorMap.get(reply.parentIndex!);
    const lastReplyerId = lastReplyerByParent.get(reply.parentIndex!);

    let replyerAccountId: string;

    if (reply.type === 'author_reply') {
      replyerAccountId = writerAccountId;
    } else if (reply.type === 'commenter_reply') {
      replyerAccountId = parentCommenterId || commenterAccounts[parentCommentOrder % commenterAccounts.length].id;
    } else {
      const excludeIds = new Set<string>();
      if (parentCommenterId) excludeIds.add(parentCommenterId);
      if (lastReplyerId) excludeIds.add(lastReplyerId);

      const availableCommenters = commenterAccounts.filter(a => !excludeIds.has(a.id));

      if (availableCommenters.length === 0) {
        const fallbackCommenters = commenterAccounts.filter(a => a.id !== lastReplyerId);
        if (fallbackCommenters.length === 0) {
          replyerAccountId = commenterAccounts[Math.floor(Math.random() * commenterAccounts.length)].id;
        } else {
          replyerAccountId = fallbackCommenters[Math.floor(Math.random() * fallbackCommenters.length)].id;
        }
      } else {
        replyerAccountId = availableCommenters[Math.floor(Math.random() * availableCommenters.length)].id;
      }
    }

    if (replyerAccountId === lastReplyerId && commenterAccounts.length > 1) {
      const alternativeAccounts = accounts.filter(a => a.id !== lastReplyerId);
      if (alternativeAccounts.length > 0) {
        replyerAccountId = alternativeAccounts[Math.floor(Math.random() * alternativeAccounts.length)].id;
      }
    }

    const replyer = accounts.find(a => a.id === replyerAccountId);
    if (!replyer) continue;

    const activityDelay = getNextActiveTime(replyer);
    const currentDelay = Math.max(replyDelay, activityDelay);

    const replyJobData: ReplyJobData = {
      type: 'reply',
      accountId: replyerAccountId,
      cafeId,
      articleId: 0,
      content: reply.content,
      commentIndex: parentCommentOrder,
      keyword,
    };

    await addTaskJob(replyerAccountId, replyJobData, currentDelay);
    lastReplyerByParent.set(reply.parentIndex!, replyerAccountId);
    replyDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
    replyCount++;
  }

  console.log(`[VIRAL] 댓글 ${commentCount}개, 대댓글 ${replyCount}개 Job 추가`);
  return { commentCount, replyCount };
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
