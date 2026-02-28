/**
 * 샤넬 카페 활동 스케줄 (댓글 15개 + 좋아요 5개)
 * - writer 계정 전부 사용
 * - 전체글보기에서 댓글 적합한 게시판 글 대상
 * - 2시간 이내 분산 (4~8분 간격)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/schedule-chanel-activity.ts
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
const COMMENTS_PER_WRITER = 15;
const LIKES_PER_WRITER = 5;
// 2시간 = 120분, 20 액션 → 평균 6분 → 4~8분 갭
const ACTION_GAP_MIN = { min: 4, max: 8 };

const CAFE_CONFIG = {
  name: '샤넬오픈런',
  cafeUrl: 'shoppingtpw',
  allowedMenuIds: new Set([60, 42, 95, 112, 72, 99, 136, 84, 34, 70, 148, 85, 86, 125, 87, 52]),
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
  '정말 유용한 정보네요 감사합니다',
  '좋은 글 잘 읽었어요',
  '공유해주셔서 감사해요 많이 배웠습니다',
  '이런 정보 찾고 있었는데 딱이네요',
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
    const gen = await generateComment(`${ctx}\n\n[지시] 반드시 존댓말로 작성할 것. 반말 금지. 짧고 자연스럽게.`, null, article.authorNickname);
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

  const dbCafe = await Cafe.findOne({ userId: user.userId, name: CAFE_CONFIG.name, isActive: true }).lean();
  if (!dbCafe) throw new Error(`카페 설정 없음: ${CAFE_CONFIG.name}`);

  const cafeId = dbCafe.cafeId;

  const writers = shuffle(
    await Account.find({ userId: user.userId, isActive: true, role: 'writer' }).lean()
  );

  if (writers.length === 0) throw new Error('writer 계정 없음');

  // 첫 writer로 글 목록 확보
  const firstWriter: NaverAccount = {
    id: writers[0].accountId,
    password: writers[0].password,
    nickname: writers[0].nickname,
  };

  const allArticles: CafeArticle[] = [];
  const seenIds = new Set<number>();
  const TARGET_ARTICLES = Math.max(80, writers.length * (COMMENTS_PER_WRITER + LIKES_PER_WRITER));
  const PER_PAGE = 20;

  console.log(`\n[BROWSE] ${CAFE_CONFIG.name} 글 확보 중 (목표: ${TARGET_ARTICLES}개)...`);

  for (let page = 1; allArticles.length < TARGET_ARTICLES && page <= 8; page++) {
    const browse = await browseCafePosts(firstWriter, cafeId, undefined, {
      page,
      perPage: PER_PAGE,
      cafeUrl: CAFE_CONFIG.cafeUrl,
    });

    if (!browse.success || browse.articles.length === 0) break;

    const newFiltered = browse.articles
      .filter((a) => CAFE_CONFIG.allowedMenuIds.has(a.menuId) && !seenIds.has(a.articleId));
    newFiltered.forEach((a) => seenIds.add(a.articleId));
    allArticles.push(...newFiltered);

    console.log(`  page ${page}: ${browse.articles.length}개 중 ${newFiltered.length}개 추가 (누적 ${allArticles.length}개)`);

    if (browse.articles.length < PER_PAGE) break;
  }

  if (allArticles.length === 0) throw new Error('댓글 대상 글 없음');

  const articles = shuffle(allArticles);
  const usedArticles = new Set<string>();
  let totalComments = 0;
  let totalLikes = 0;

  console.log('');
  console.log('=== 샤넬 카페 활동 스케줄 ===');
  console.log(`카페: ${CAFE_CONFIG.name} (${CAFE_CONFIG.cafeUrl})`);
  console.log(`writers: ${writers.length}명`);
  console.log(`per writer: 댓글 ${COMMENTS_PER_WRITER}개 + 좋아요 ${LIKES_PER_WRITER}개`);
  console.log(`액션 간격: ${ACTION_GAP_MIN.min}~${ACTION_GAP_MIN.max}분`);
  console.log(`예상 소요: ${Math.round(((COMMENTS_PER_WRITER + LIKES_PER_WRITER) * (ACTION_GAP_MIN.min + ACTION_GAP_MIN.max) / 2))}분/계정`);
  console.log(`확보된 글: ${articles.length}개`);
  console.log('');

  for (let i = 0; i < writers.length; i++) {
    const w = writers[i];
    const naverAcc: NaverAccount = { id: w.accountId, password: w.password, nickname: w.nickname };

    console.log(`[${i + 1}/${writers.length}] ${w.accountId} (${w.nickname})`);

    let cumulativeDelay = 0;

    // 댓글 대상 선택 (자기 글 제외, 이미 사용된 글 제외)
    const available = articles.filter((a) => {
      const key = `${cafeId}:${a.articleId}`;
      if (usedArticles.has(key)) return false;
      if (w.nickname && a.nickname === w.nickname) return false;
      return true;
    });

    if (available.length === 0) {
      console.log('  남은 글 없음 스킵');
      continue;
    }

    // 댓글 대상
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
      console.log(`  댓글 #${target.articleId} "${target.subject?.slice(0, 25)}" (${Math.round(cumulativeDelay / 60000)}분 후)`);
      cumulativeDelay += (ACTION_GAP_MIN.min + Math.random() * (ACTION_GAP_MIN.max - ACTION_GAP_MIN.min)) * 60 * 1000;
    }

    // 좋아요 대상 (댓글 안 단 글)
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
      console.log(`  좋아요 #${target.articleId} "${target.subject?.slice(0, 25)}" (${Math.round(cumulativeDelay / 60000)}분 후)`);
      cumulativeDelay += (ACTION_GAP_MIN.min + Math.random() * (ACTION_GAP_MIN.max - ACTION_GAP_MIN.min)) * 60 * 1000;
    }

    const totalMin = Math.round(cumulativeDelay / 60000);
    console.log(`  → 총 ${totalMin}분 (${Math.round(totalMin / 60 * 10) / 10}시간) 소요 예상`);
    console.log('');
  }

  console.log('=== 완료 ===');
  console.log(`댓글: ${totalComments}개 / 좋아요: ${totalLikes}개`);
  console.log(`사용된 글: ${usedArticles.size}개 (겹침 없음)`);
  console.log(`writers: ${writers.length}명`);
};

main()
  .then(async () => {
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('\nfailed:', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
