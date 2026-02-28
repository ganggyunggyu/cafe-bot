/**
 * 사이드 활동 큐 등록 (댓글 + 좋아요)
 * - writer 계정만 사용
 * - 전체글보기에서 최신글 대상
 * - 계정 간 겹치지 않게 분배
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/queue-side-activity.ts
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { addTaskJob } from '../src/shared/lib/queue';
import { browseCafePosts, type CafeArticle } from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateComment } from '../src/shared/api/comment-gen-api';
import type { NaverAccount } from '../src/shared/lib/account-manager';
import type { CommentJobData, LikeJobData } from '../src/shared/lib/queue/types';

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;
const COMMENTS_PER_WRITER = 5;
const LIKES_PER_WRITER = 3;
const ACTION_GAP_MIN = { min: 20, max: 35 }; // 액션 간 20~35분 랜덤

const CAFE_URLS: Record<string, string> = {
  '쇼핑지름신': 'shopjirmsin',
  '샤넬오픈런': 'shoppingtpw',
};

// DB commentableMenuIds 없을 때 fallback
const FALLBACK_MENU_IDS: Record<string, Set<number>> = {
  '샤넬오픈런': new Set([60, 42, 95, 112, 72, 99, 136, 84, 34, 70, 148, 85, 86, 125, 87, 52]),
  '쇼핑지름신': new Set([847, 919, 153, 948, 278, 949, 337, 165, 715, 63, 251, 186, 751, 588]),
};

const FALLBACKS = [
  '좋은 정보 감사합니다 참고해볼게요',
  '저도 비슷하게 느꼈어요 공감해요',
  '정리 잘해주셨네요 도움 됐어요',
  '오 저도 궁금했는데 감사합니다',
  '핵심만 잘 정리돼서 읽기 편했어요',
  '경험 공유 감사합니다',
  '저도 한번 알아봐야겠어요',
  '공감하면서 읽었습니다',
];

const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

const shuffle = <T>(arr: T[]): T[] => {
  const s = [...arr];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
};

const smartComment = async (
  writer: NaverAccount,
  cafeId: string,
  articleId: number
): Promise<string> => {
  const fallback = pick(FALLBACKS);
  try {
    const article = await readCafeArticleContent(writer, cafeId, articleId);
    if (!article.success || !article.content) return fallback;
    const ctx = article.title ? `${article.title}\n\n${article.content}` : article.content;
    const gen = await generateComment(`${ctx}\n\n[지시] 반드시 존댓말로 작성할 것. 반말 금지.`, null, article.authorNickname);
    return gen.trim() || fallback;
  } catch {
    return fallback;
  }
};

const main = async () => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const dbCafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const writers = shuffle(
    await Account.find({ userId: user.userId, isActive: true, role: 'writer' }).lean()
  );

  if (writers.length === 0) throw new Error('no writers');

  // 첫 writer로 전체글보기 최신글 확보
  const firstWriter: NaverAccount = {
    id: writers[0].accountId,
    password: writers[0].password,
    nickname: writers[0].nickname,
  };

  const cafePools: Map<string, { cafeId: string; articles: CafeArticle[] }> = new Map();

  const TARGET_ARTICLES = 50;
  const PER_PAGE = 20;

  for (const dbCafe of dbCafes) {
    const cafeUrl = CAFE_URLS[dbCafe.name];
    if (!cafeUrl) {
      console.log(`${dbCafe.name}: URL 매핑 없음 스킵`);
      continue;
    }

    const allowedMenuIds = dbCafe.commentableMenuIds?.length
      ? new Set(dbCafe.commentableMenuIds)
      : FALLBACK_MENU_IDS[dbCafe.name];

    if (!allowedMenuIds || allowedMenuIds.size === 0) {
      console.log(`${dbCafe.name}: commentableMenuIds 없음 스킵`);
      continue;
    }

    const allArticles: CafeArticle[] = [];
    const seenIds = new Set<number>();

    for (let page = 1; allArticles.length < TARGET_ARTICLES && page <= 5; page++) {
      const browse = await browseCafePosts(firstWriter, dbCafe.cafeId, undefined, {
        page,
        perPage: PER_PAGE,
        cafeUrl,
      });

      if (!browse.success || browse.articles.length === 0) break;

      const newFiltered = browse.articles
        .filter((a) => allowedMenuIds.has(a.menuId) && !seenIds.has(a.articleId));
      newFiltered.forEach((a) => seenIds.add(a.articleId));
      allArticles.push(...newFiltered);

      console.log(`${dbCafe.name} page ${page}: ${browse.articles.length}개 중 ${newFiltered.length}개 추가 (누적 ${allArticles.length}개)`);

      if (browse.articles.length < PER_PAGE) break;
    }

    if (allArticles.length === 0) {
      console.log(`${dbCafe.name}: 글 없음 스킵`);
      continue;
    }

    cafePools.set(dbCafe.name, { cafeId: dbCafe.cafeId, articles: shuffle(allArticles) });
    console.log(`${dbCafe.name}: 총 ${allArticles.length}개 확보 (DB menuIds: ${dbCafe.commentableMenuIds?.length ? 'O' : 'fallback'})`);
  }

  if (cafePools.size === 0) throw new Error('카페에서 글을 가져올 수 없음');

  const usedArticles = new Set<string>();
  let totalComments = 0;
  let totalLikes = 0;

  console.log('');
  console.log('=== SIDE ACTIVITY QUEUE ===');
  console.log(`writers: ${writers.length}명 (셔플됨)`);
  console.log(`cafes: ${[...cafePools.keys()].join(', ')}`);
  console.log(`per writer: 댓글 ${COMMENTS_PER_WRITER}개 + 좋아요 ${LIKES_PER_WRITER}개 / 카페`);
  console.log(`액션 간격: ${ACTION_GAP_MIN.min}~${ACTION_GAP_MIN.max}분`);
  console.log('');

  for (let i = 0; i < writers.length; i++) {
    const w = writers[i];
    const startAt = new Date(Date.now());
    const naverAcc: NaverAccount = { id: w.accountId, password: w.password, nickname: w.nickname };

    console.log(`[${i + 1}/${writers.length}] ${w.accountId} (시작: ${startAt.toLocaleTimeString('ko-KR')})`);

    let cumulativeDelay = 0;

    for (const [cafeName, { cafeId, articles }] of cafePools) {
      const available = articles.filter((a) => {
        const key = `${cafeId}:${a.articleId}`;
        if (usedArticles.has(key)) return false;
        if (w.nickname && a.nickname === w.nickname) return false;
        return true;
      });

      if (available.length === 0) {
        console.log(`  ${cafeName}: 남은 글 없음 스킵`);
        continue;
      }

      // 댓글
      const commentTargets = available.slice(0, Math.min(COMMENTS_PER_WRITER, available.length));
      for (const target of commentTargets) {
        usedArticles.add(`${cafeId}:${target.articleId}`);
        const commentText = await smartComment(naverAcc, cafeId, target.articleId);

        const job: CommentJobData = {
          type: 'comment',
          accountId: w.accountId,
          cafeId,
          articleId: target.articleId,
          content: commentText,
        };
        await addTaskJob(w.accountId, job, cumulativeDelay);
        totalComments++;
        console.log(`  ${cafeName} 댓글 #${target.articleId} "${target.subject?.slice(0, 20)}" (${Math.round(cumulativeDelay / 60000)}분 후)`);
        cumulativeDelay += (ACTION_GAP_MIN.min + Math.random() * (ACTION_GAP_MIN.max - ACTION_GAP_MIN.min)) * 60 * 1000;
      }

      // 좋아요 (댓글 안 단 글)
      const commentedIds = new Set(commentTargets.map((t) => t.articleId));
      const likeAvailable = available.filter((a) => !commentedIds.has(a.articleId));
      const likeTargets = likeAvailable.slice(0, Math.min(LIKES_PER_WRITER, likeAvailable.length));

      for (const target of likeTargets) {
        usedArticles.add(`${cafeId}:${target.articleId}`);

        const job: LikeJobData = {
          type: 'like',
          accountId: w.accountId,
          cafeId,
          articleId: target.articleId,
        };
        await addTaskJob(w.accountId, job, cumulativeDelay);
        totalLikes++;
        console.log(`  ${cafeName} 좋아요 #${target.articleId} "${target.subject?.slice(0, 20)}" (${Math.round(cumulativeDelay / 60000)}분 후)`);
        cumulativeDelay += (ACTION_GAP_MIN.min + Math.random() * (ACTION_GAP_MIN.max - ACTION_GAP_MIN.min)) * 60 * 1000;
      }
    }
    console.log('');
  }

  console.log('=== 완료 ===');
  console.log(`댓글: ${totalComments}개 / 좋아요: ${totalLikes}개`);
  console.log(`사용된 글: ${usedArticles.size}개 (겹침 없음)`);
};

main()
  .then(async () => {
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('failed:', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
