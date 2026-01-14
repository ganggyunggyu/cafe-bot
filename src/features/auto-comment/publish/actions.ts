'use server';

import mongoose from 'mongoose';
import { getAllAccounts } from '@/shared/config/accounts';
import { connectDB } from '@/shared/lib/mongodb';
import { PublishedArticle } from '@/shared/models';
import { generateComment, generateReply } from '@/shared/api/comment-gen-api';
import { addTaskJob } from '@/shared/lib/queue';
import { startAllTaskWorkers } from '@/shared/lib/queue/workers';
import { getQueueSettings, getRandomDelay } from '@/shared/models/queue-settings';
import { isAccountActive, getPersonaIndex } from '@/shared/lib/account-manager';
import type { CommentJobData, ReplyJobData } from '@/shared/lib/queue/types';
import type {
  CommentOnlyFilter,
  CommentTargetArticle,
  CommentOnlyResult,
} from './types';

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

// 자동 댓글 달기 (큐 기반)
// N일 이내 글 중 랜덤 절반, 글당 3~15개, 대댓글 50% / 댓글 50%
export async function runAutoCommentAction(
  cafeId: string,
  daysLimit: number = 3
): Promise<CommentOnlyResult> {
  console.log('[AUTO-COMMENT] 시작 - cafeId:', cafeId, 'daysLimit:', daysLimit);

  const accounts = getAllAccounts();
  if (accounts.length < 2) {
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
      message: '계정이 2개 이상 필요해',
    };
  }

  try {
    await connectDB();

    if (mongoose.connection.readyState !== 1) {
      console.log('[AUTO-COMMENT] MongoDB 연결 실패');
      return {
        success: false,
        totalArticles: 0,
        completed: 0,
        failed: 0,
        results: [],
        message: 'MongoDB 연결 실패',
      };
    }

    const settings = await getQueueSettings();

    // 워커 시작
    startAllTaskWorkers();

    // N일 이내 글 조회
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

    const allArticles = await PublishedArticle.find({
      cafeId,
      status: 'published',
      publishedAt: { $gte: cutoffDate },
    }).lean();

    console.log(`[AUTO-COMMENT] ${daysLimit}일 이내 글 총 ${allArticles.length}개`);

    if (allArticles.length === 0) {
      return {
        success: true,
        totalArticles: 0,
        completed: 0,
        failed: 0,
        results: [],
        message: '대상 글이 없음',
      };
    }

    // 랜덤으로 절반 선택
    const shuffled = allArticles.sort(() => Math.random() - 0.5);
    const halfCount = Math.max(1, Math.ceil(allArticles.length / 2));
    const selectedArticles = shuffled.slice(0, halfCount);

    console.log(`[AUTO-COMMENT] 랜덤 ${selectedArticles.length}개 선택`);

    // 활동 가능한 계정만 필터링
    const activeAccounts = accounts.filter(isAccountActive);
    if (activeAccounts.length === 0) {
      return {
        success: false,
        totalArticles: selectedArticles.length,
        completed: 0,
        failed: 0,
        results: [],
        message: '활동 가능한 계정이 없음 (비활동 시간대)',
      };
    }

    let jobsAdded = 0;

    // 계정별 딜레이 추적
    const accountDelays: Map<string, number> = new Map();

    for (let i = 0; i < selectedArticles.length; i++) {
      const article = selectedArticles[i];
      const { articleId, keyword, writerAccountId } = article;

      console.log(`[AUTO-COMMENT] ${i + 1}/${selectedArticles.length}: #${articleId} "${keyword}"`);

      // 글쓴이 제외한 활동 가능한 계정
      const otherAccounts = activeAccounts.filter((a) => a.id !== writerAccountId);
      if (otherAccounts.length === 0) {
        console.log(`[AUTO-COMMENT] #${articleId} - 활동 가능한 계정 없음, 스킵`);
        continue;
      }

      // 글쓴이 계정 정보 (닉네임 전달용)
      const writerAccount = accounts.find((a) => a.id === writerAccountId);
      const writerNickname = writerAccount?.nickname || writerAccountId;

      // 글당 3~15개 작성
      const totalCount = Math.floor(Math.random() * 13) + 3; // 3~15
      // 50% 대댓글, 50% 댓글
      const replyCount = Math.round(totalCount * 0.5);
      const commentCount = totalCount - replyCount;

      console.log(`[AUTO-COMMENT] #${articleId} - 댓글 ${commentCount}개, 대댓글 ${replyCount}개 job 추가`);

      // 이 글의 댓글 작성자 추적 초기화 (닉네임 포함)
      const articleCommentAuthors: Array<{ id: string; nickname: string }> = [];

      // 댓글 job 추가 (30%)
      for (let j = 0; j < commentCount; j++) {
        const commenter = otherAccounts[j % otherAccounts.length];
        const personaIndex = getPersonaIndex(commenter);

        let commentText: string;
        try {
          commentText = await generateComment(keyword, personaIndex, writerNickname);
        } catch {
          commentText = '좋은 정보 감사합니다!';
        }

        const currentDelay = accountDelays.get(commenter.id) ?? 0;
        const nextDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
        accountDelays.set(commenter.id, nextDelay);

        const commentJobData: CommentJobData = {
          type: 'comment',
          accountId: commenter.id,
          cafeId,
          articleId,
          content: commentText,
        };

        await addTaskJob(commenter.id, commentJobData, currentDelay);
        jobsAdded++;

        // 댓글 작성자 기록 (닉네임 포함)
        const commenterNickname = commenter.nickname || commenter.id;
        articleCommentAuthors.push({ id: commenter.id, nickname: commenterNickname });
      }

      // 대댓글 job 추가 (70%)
      // 댓글이 끝난 후 대댓글 시작
      const maxCommentDelay = Math.max(...Array.from(accountDelays.values()), 0);
      const replyBaseDelay = maxCommentDelay + getRandomDelay(settings.delays.afterPost);

      for (let j = 0; j < replyCount; j++) {
        // 대댓글 타겟 인덱스
        const targetCommentIndex = j % Math.max(1, commentCount + (article.commentCount ?? 0));

        // 자기 댓글에 대댓글 달지 않도록 다른 계정 선택
        let replyer = otherAccounts[(commentCount + j) % otherAccounts.length];

        // 원댓글 작성자 정보
        const targetCommentAuthor = articleCommentAuthors[targetCommentIndex];
        const parentAuthorNickname = targetCommentAuthor?.nickname;

        // 새로 단 댓글에 대댓글 다는 경우, 자기 댓글인지 체크
        if (targetCommentAuthor && replyer.id === targetCommentAuthor.id) {
          // 다른 계정으로 변경
          const alternativeReplyer = otherAccounts.find(
            (a) => a.id !== targetCommentAuthor.id && a.id !== replyer.id
          );
          if (alternativeReplyer) {
            replyer = alternativeReplyer;
          } else {
            // 대체 계정이 없으면 스킵
            console.log(`[AUTO-COMMENT] #${articleId} 대댓글 ${j} - 자기 댓글에 대댓글 방지로 스킵`);
            continue;
          }
        }

        const replyerPersonaIndex = getPersonaIndex(replyer);

        let replyText: string;
        try {
          // 글쓴이 닉네임 + 원댓글 작성자 닉네임 전달
          replyText = await generateReply(keyword, '좋은 정보네요', replyerPersonaIndex, writerNickname, parentAuthorNickname);
        } catch {
          replyText = '저도 그렇게 생각해요!';
        }

        const currentDelay = accountDelays.get(replyer.id) ?? replyBaseDelay;
        const nextDelay = currentDelay + getRandomDelay(settings.delays.betweenComments);
        accountDelays.set(replyer.id, nextDelay);

        const replyJobData: ReplyJobData = {
          type: 'reply',
          accountId: replyer.id,
          cafeId,
          articleId,
          content: replyText,
          commentIndex: targetCommentIndex,
        };

        await addTaskJob(replyer.id, replyJobData, currentDelay);
        jobsAdded++;
      }
    }

    return {
      success: jobsAdded > 0,
      totalArticles: selectedArticles.length,
      completed: jobsAdded,
      failed: 0,
      results: [],
      message: `${jobsAdded}개 job이 큐에 추가됨 (${selectedArticles.length}개 글 대상)`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error('[AUTO-COMMENT] 에러:', errorMessage);
    return {
      success: false,
      totalArticles: 0,
      completed: 0,
      failed: 0,
      results: [],
      message: errorMessage,
    };
  }
}
