import { type NaverAccount, getPersonaId } from '@/shared/lib/account-manager';
import { generateContent } from '@/shared/api/content-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { ModifiedArticle, PublishedArticle, type IPublishedArticle } from '@/shared/models';
import { modifyArticleWithAccount } from './article-modifier';
import { parseKeywordWithCategory } from './keyword-utils';
import type { ProgressCallback } from './types';

export interface ModifyLogEntry {
  keyword: string;
  articleId: number;
  success: boolean;
  commentCount: number;
  replyCount: number;
  error?: string;
}

export interface ModifyProcessResult {
  success: boolean;
  keywordResult: ModifyKeywordResultShape;
  logEntry: ModifyLogEntry;
}

export interface ModifyKeywordResultShape {
  keyword: string;
  articleId: number;
  success: boolean;
  error?: string;
}

interface ModifyArticleParams {
  service: string;
  adKeywordInput: string;
  article: IPublishedArticle;
  cafeId: string;
  writerAccount: NaverAccount;
  ref?: string;
  keywordIndex: number;
  totalKeywords: number;
  onProgress?: ProgressCallback;
}

export const processArticleModification = async ({
  service,
  adKeywordInput,
  article,
  cafeId,
  writerAccount,
  ref,
  keywordIndex,
  totalKeywords,
  onProgress,
}: ModifyArticleParams): Promise<ModifyProcessResult> => {
  const { keyword: adKeyword, category } = parseKeywordWithCategory(adKeywordInput);
  const { articleId, commentCount, replyCount, writerAccountId } = article;

  try {
    onProgress?.({
      currentKeyword: adKeyword,
      keywordIndex,
      totalKeywords,
      phase: 'post',
      message: `[${keywordIndex + 1}/${totalKeywords}] "${adKeyword}" - 광고글로 수정 중...`,
    });

    // 광고 콘텐츠 생성 (카테고리가 있으면 키워드에 포함)
    const keywordWithCategory = category ? `${adKeyword} (카테고리: ${category})` : adKeyword;
    const personaId = getPersonaId(writerAccount);
    const generated = await generateContent({ service, keyword: keywordWithCategory, ref, personaId });
    const { title: newTitle, htmlContent: newContent } = buildCafePostContent(generated.content, adKeyword);

    // 글 수정
    const modifyResult = await modifyArticleWithAccount(writerAccount, {
      cafeId,
      articleId,
      newTitle,
      newContent,
      category,
    });

    if (!modifyResult.success) {
      const failureLog: ModifyLogEntry = {
        keyword: adKeyword,
        articleId,
        success: false,
        commentCount,
        replyCount,
        error: modifyResult.error || '글 수정 실패',
      };

      return {
        success: false,
        keywordResult: {
          keyword: adKeyword,
          articleId,
          success: false,
          error: modifyResult.error,
        },
        logEntry: failureLog,
      };
    }

    // ModifiedArticle 저장
    await ModifiedArticle.create({
      originalArticleId: article._id,
      articleId,
      cafeId,
      keyword: adKeyword,
      newTitle,
      newContent,
      modifiedAt: new Date(),
      modifiedBy: writerAccountId,
    });

    // PublishedArticle 삭제 (수정 완료 후 발행원고에서 제거)
    await PublishedArticle.deleteOne({ _id: article._id });

    const successLog: ModifyLogEntry = {
      keyword: adKeyword,
      articleId,
      success: true,
      commentCount,
      replyCount,
    };

    return {
      success: true,
      keywordResult: {
        keyword: adKeyword,
        articleId,
        success: true,
      },
      logEntry: successLog,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    const failureLog: ModifyLogEntry = {
      keyword: adKeyword,
      articleId,
      success: false,
      commentCount,
      replyCount,
      error: errorMessage,
    };

    return {
      success: false,
      keywordResult: {
        keyword: adKeyword,
        articleId,
        success: false,
        error: errorMessage,
      },
      logEntry: failureLog,
    };
  }
}
