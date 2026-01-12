'use server';

import mongoose from 'mongoose';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { getAllAccounts } from '@/shared/config/accounts';
import { getDefaultCafe, getCafeById } from '@/shared/config/cafes';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle } from '@/shared/models';
import { generateContent } from '@/shared/api/content-api';
import { generateComment } from '@/shared/api/comment-gen-api';
import { buildCafePostContent } from '@/shared/lib/cafe-content';
import { writePostWithAccount } from '../batch/post-writer';
import { writeCommentWithAccount } from '../comment-writer';
import { getWriterAccount } from '../batch/types';
import { parseKeywordWithCategory } from '../batch/keyword-utils';
import type {
  PostOnlyInput,
  PostOnlyResult,
  PostOnlyKeywordResult,
  CommentOnlyFilter,
  CommentTargetArticle,
  CommentOnlyResult,
  CommentOnlyArticleResult,
} from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 글만 발행 (댓글 없이)
export async function runPostOnlyAction(
  input: PostOnlyInput
): Promise<PostOnlyResult> {
  const { keywords, ref, cafeId: inputCafeId, postOptions } = input;

  console.log('[POST-ONLY] 시작:', keywords.length, '개 키워드');

  const accounts = getAllAccounts();
  if (accounts.length < 1) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: [],
    };
  }

  const cafe = inputCafeId ? getCafeById(inputCafeId) : getDefaultCafe();
  if (!cafe) {
    return {
      success: false,
      totalKeywords: keywords.length,
      completed: 0,
      failed: keywords.length,
      results: [],
    };
  }

  const { cafeId, menuId } = cafe;
  const results: PostOnlyKeywordResult[] = [];
  let completed = 0;
  let failed = 0;

  // MongoDB 연결
  let dbConnected = false;
  try {
    await connectDB();
    dbConnected = mongoose.connection.readyState === 1;
  } catch {
    console.log('[POST-ONLY] MongoDB 연결 실패 - 로깅 없이 진행');
  }

  try {
    for (let i = 0; i < keywords.length; i++) {
      const rawKeyword = keywords[i];
      const { keyword, category } = parseKeywordWithCategory(rawKeyword);
      const writerAccount = getWriterAccount(accounts, i);

      console.log(`[POST-ONLY] ${i + 1}/${keywords.length}: "${keyword}" (${writerAccount.id})`);

      try {
        // AI 콘텐츠 생성
        const keywordWithCategory = category ? `${keyword} (카테고리: ${category})` : keyword;
        const generated = await generateContent({ service: '일반', keyword: keywordWithCategory, ref });
        const { title, htmlContent } = buildCafePostContent(generated.content, keyword);

        // 글 작성
        const postResult = await writePostWithAccount(writerAccount, {
          cafeId,
          menuId,
          subject: title,
          content: htmlContent,
          category,
          postOptions,
        });

        if (postResult.success && postResult.articleId) {
          // 발행원고 저장
          if (dbConnected) {
            const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${postResult.articleId}`;
            await PublishedArticle.create({
              articleId: postResult.articleId,
              cafeId,
              menuId,
              keyword,
              title,
              content: htmlContent,
              articleUrl,
              writerAccountId: writerAccount.id,
              status: 'published',
              commentCount: 0,
              replyCount: 0,
            });
          }

          results.push({
            keyword,
            success: true,
            articleId: postResult.articleId,
            writerAccountId: writerAccount.id,
          });
          completed++;
        } else {
          results.push({
            keyword,
            success: false,
            writerAccountId: writerAccount.id,
            error: postResult.error || '글 작성 실패',
          });
          failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        results.push({
          keyword,
          success: false,
          writerAccountId: writerAccount.id,
          error: errorMessage,
        });
        failed++;
      }

      // 다음 키워드 전 대기
      if (i < keywords.length - 1) {
        await sleep(5000);
      }
    }

    return {
      success: failed === 0,
      totalKeywords: keywords.length,
      completed,
      failed,
      results,
    };
  } finally {
    await closeAllContexts();
  }
}

// 필터링된 발행원고 조회
export async function fetchFilteredArticles(
  filter: CommentOnlyFilter
): Promise<CommentTargetArticle[]> {
  const { cafeId, minDaysOld, maxComments, articleCount } = filter;

  console.log('[COMMENT-ONLY] 필터링 조회:', filter);

  try {
    await connectDB();

    if (mongoose.connection.readyState !== 1) {
      console.log('[COMMENT-ONLY] MongoDB 연결 실패');
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minDaysOld);

    const articles = await PublishedArticle.find({
      cafeId,
      status: 'published',
      publishedAt: { $lte: cutoffDate },
      commentCount: { $lte: maxComments },
    })
      .sort({ publishedAt: 1 }) // 오래된 순
      .limit(articleCount * 3) // 여유있게 가져와서 랜덤 선택
      .lean();

    // 랜덤 셔플 후 articleCount개 선택
    const shuffled = articles.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, articleCount);

    return selected.map((a) => ({
      articleId: a.articleId,
      cafeId: a.cafeId,
      keyword: a.keyword,
      title: a.title,
      publishedAt: a.publishedAt,
      commentCount: a.commentCount,
      writerAccountId: a.writerAccountId,
    }));
  } catch (error) {
    console.error('[COMMENT-ONLY] 조회 오류:', error);
    return [];
  }
}

// 기존 글에 댓글 달기
export async function runCommentOnlyAction(
  articles: CommentTargetArticle[]
): Promise<CommentOnlyResult> {
  console.log('[COMMENT-ONLY] 시작:', articles.length, '개 글');

  const accounts = getAllAccounts();
  if (accounts.length < 2) {
    return {
      success: false,
      totalArticles: articles.length,
      completed: 0,
      failed: articles.length,
      results: [],
    };
  }

  const results: CommentOnlyArticleResult[] = [];
  let completed = 0;
  let failed = 0;

  try {
    await connectDB();

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const { articleId, cafeId, keyword, writerAccountId } = article;

      console.log(`[COMMENT-ONLY] ${i + 1}/${articles.length}: #${articleId} "${keyword}"`);

      try {
        // 글쓴이 제외한 계정 중 랜덤 1-2개 선택
        const commenters = accounts
          .filter((a) => a.id !== writerAccountId)
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.floor(Math.random() * 2) + 1); // 1-2개

        let commentsAdded = 0;

        for (const commenter of commenters) {
          // AI로 댓글 생성
          let commentText: string;
          try {
            commentText = await generateComment(keyword);
          } catch {
            commentText = '좋은 정보 감사합니다!';
          }

          const result = await writeCommentWithAccount(
            commenter,
            cafeId,
            articleId,
            commentText
          );

          if (result.success) {
            commentsAdded++;
          }

          await sleep(3000);
        }

        // DB 업데이트
        if (mongoose.connection.readyState === 1) {
          await PublishedArticle.updateOne(
            { cafeId, articleId },
            { $inc: { commentCount: commentsAdded } }
          );
        }

        results.push({
          articleId,
          keyword,
          success: commentsAdded > 0,
          commentsAdded,
        });

        if (commentsAdded > 0) {
          completed++;
        } else {
          failed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
        results.push({
          articleId,
          keyword,
          success: false,
          commentsAdded: 0,
          error: errorMessage,
        });
        failed++;
      }

      // 다음 글 전 대기
      if (i < articles.length - 1) {
        await sleep(5000);
      }
    }

    return {
      success: failed === 0,
      totalArticles: articles.length,
      completed,
      failed,
      results,
    };
  } finally {
    await closeAllContexts();
  }
}
