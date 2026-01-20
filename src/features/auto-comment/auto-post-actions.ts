'use server';

import { auth } from '@/shared/lib/auth';
import { generateContent } from '@/shared/api/content-api';
import { postToCafe } from '@/shared/api/naver-cafe-api';
import { getCommentAccounts } from '@/shared/config/accounts';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getDefaultCafe } from '@/shared/config/cafes';
import { getCommentDelayMs } from './comment-delay';
import { writeCommentWithAccount, type WriteCommentResult } from './comment-writer';

export interface AutoPostResult {
  success: boolean;
  articleId?: number;
  articleUrl?: string;
  commentResults?: WriteCommentResult[];
  error?: string;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const writeComments = async (
  cafeId: string,
  articleId: number,
  comments: string[]
): Promise<WriteCommentResult[]> => {
  const commentAccounts = await getCommentAccounts();
  const results: WriteCommentResult[] = [];

  for (let i = 0; i < commentAccounts.length && i < comments.length; i++) {
    const account = commentAccounts[i];
    const comment = comments[i]?.trim();

    if (!comment) continue;

    await sleep(getCommentDelayMs());

    const result = await writeCommentWithAccount(account, cafeId, articleId, comment);
    results.push(result);
  }

  return results;
}

export const autoPostWithComments = async (input: {
  service: string;
  keyword: string;
  ref?: string;
  comments: string[];
}): Promise<AutoPostResult> => {
  const { service, keyword, ref, comments } = input;

  try {
    const session = await auth();

    if (!session?.accessToken) {
      return {
        success: false,
        error: '네이버 로그인이 필요합니다. OAuth로 로그인해주세요.',
      };
    }

    const cafe = await getDefaultCafe();

    if (!cafe) {
      return {
        success: false,
        error: '카페 설정이 없습니다.',
      };
    }

    const { cafeId, menuId } = cafe;

    const generated = await generateContent({ service, keyword, ref });
    const { title, htmlContent } = buildCafePostContent(generated.content, keyword);

    const postResponse = await postToCafe(session.accessToken, {
      clubId: cafeId,
      menuId: menuId,
      subject: title,
      content: htmlContent,
    });

    const articleId = postResponse.message.result?.articleId;
    const articleUrl = postResponse.message.result?.articleUrl;

    if (!articleId) {
      return {
        success: false,
        error: '글 작성은 됐는데 articleId를 가져오지 못했습니다.',
      };
    }

    const commentResults = await writeComments(cafeId, articleId, comments);

    return {
      success: true,
      articleId,
      articleUrl,
      commentResults,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, '알 수 없는 오류가 발생했습니다.'),
    };
  } finally {
    await closeAllContexts();
  }
}

export const addCommentsToArticle = async (input: {
  articleId: number;
  comments: string[];
}): Promise<{ success: boolean; results?: WriteCommentResult[]; error?: string }> => {
  const { articleId, comments } = input;

  try {
    const cafe = await getDefaultCafe();

    if (!cafe) {
      return { success: false, error: '카페 설정이 없습니다.' };
    }

    const results = await writeComments(cafe.cafeId, articleId, comments);

    return { success: true, results };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error, '알 수 없는 오류'),
    };
  } finally {
    await closeAllContexts();
  }
}
