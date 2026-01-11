'use server';

import { auth } from '@/shared/lib/auth';
import { generateContent } from '@/shared/api/content-api';
import { postToCafe } from '@/shared/api/naver-cafe-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { getDefaultCafe } from '@/shared/config/cafes';
import type { PostArticleInput } from '@/shared/types';

export interface PostArticleResult {
  success: boolean;
  articleUrl?: string;
  articleId?: number;
  error?: string;
  generatedContent?: string;
}

export const postArticle = async (input: PostArticleInput): Promise<PostArticleResult> => {
  try {
    const session = await auth();

    if (!session?.accessToken) {
      return {
        success: false,
        error: '로그인이 필요해.',
      };
    }

    const defaultCafe = getDefaultCafe();
    const cafeId = input.cafeId || defaultCafe?.cafeId;
    const menuId = input.menuId || defaultCafe?.menuId;

    if (!cafeId || !menuId) {
      return {
        success: false,
        error: '카페 ID 또는 메뉴 ID가 설정되지 않았어.',
      };
    }

    const generated = await generateContent({
      service: input.service,
      keyword: input.keyword,
      ref: input.ref,
    });

    const { title, htmlContent } = buildCafePostContent(generated.content, input.keyword);

    const response = await postToCafe(session.accessToken, {
      clubId: cafeId,
      menuId: menuId,
      subject: title,
      content: htmlContent,
    });

    return {
      success: true,
      articleUrl: response.message.result?.articleUrl,
      articleId: response.message.result?.articleId,
      generatedContent: generated.content,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했어.';
    return {
      success: false,
      error: errorMessage,
    };
  }
}
