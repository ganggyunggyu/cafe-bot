'use server';

import { writeComment, writeReply, naverLogin } from '@/shared/api/naver-comment-api';
import { getDefaultCafe } from '@/shared/config/cafes';
import type { CommentInput, ReplyInput, NaverLoginInput } from '@/shared/types';

export interface CommentActionResult {
  success: boolean;
  error?: string;
}

export const postComment = async (input: CommentInput): Promise<CommentActionResult> => {
  try {
    const cafeId = input.cafeId || getDefaultCafe()?.cafeId;

    if (!cafeId) {
      return {
        success: false,
        error: '카페 ID가 설정되지 않았어.',
      };
    }

    const result = await writeComment({
      cafeId,
      articleId: input.articleId,
      content: input.content,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했어.';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export const postReply = async (input: ReplyInput): Promise<CommentActionResult> => {
  try {
    const cafeId = input.cafeId || getDefaultCafe()?.cafeId;

    if (!cafeId) {
      return {
        success: false,
        error: '카페 ID가 설정되지 않았어.',
      };
    }

    const result = await writeReply({
      cafeId,
      articleId: input.articleId,
      content: input.content,
      parentCommentId: input.parentCommentId,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했어.';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export const loginNaver = async (input: NaverLoginInput): Promise<CommentActionResult> => {
  try {
    const result = await naverLogin(input.id, input.password);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했어.';
    return {
      success: false,
      error: errorMessage,
    };
  }
}
