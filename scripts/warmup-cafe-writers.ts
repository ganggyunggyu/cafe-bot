/**
 * 글쓴이 계정 등업 웜업 스크립트
 * - writer 계정별로 두 카페에 순차 접속 + 댓글
 * - 사이클(전체 writer 처리) 후 30분 대기, 무한 반복
 * - 충돌 방지: writer별 순차 처리 (동일 계정 동시 사용 없음)
 *
 * Usage:
 *   LOGIN_ID=21lab npx tsx --env-file=.env.local scripts/warmup-cafe-writers.ts
 */

import mongoose from 'mongoose';
import { browseCafePosts, pickRandomArticles } from '../src/shared/lib/cafe-browser';
import { writeCommentWithAccount } from '../src/features/auto-comment/comment-writer';
import type { NaverAccount } from '../src/shared/lib/account-manager';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const INTERVAL_MIN = Number(process.env.INTERVAL_MIN || 30);
const COMMENTS_PER_CAFE = Number(process.env.COMMENTS_PER_CAFE || 2);
const MONGODB_URI = process.env.MONGODB_URI;

// 등업 대상 카페 (이름 기준)
const TARGET_CAFE_NAMES = ['샤넬오픈런', '쇼핑지름신'];

const COMMENT_TEMPLATES = [
  '좋은 정보 감사합니다.',
  '공감하면서 읽었어요.',
  '참고할게요.',
  '도움이 됐어요.',
  '유익한 글이네요.',
  '이런 정보 찾고 있었어요.',
  '잘 보고 갑니다.',
  '정성글 감사해요.',
  '경험 공유 감사합니다.',
  '내용이 좋네요.',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toNaverAccount = (a: { accountId: string; password: string; nickname?: string }): NaverAccount => ({
  id: a.accountId,
  password: a.password,
  nickname: a.nickname,
});

const commentInCafe = async (
  writer: NaverAccount,
  cafe: { name: string; cafeId: string; menuId: string },
  count: number,
  seed: number,
): Promise<number> => {
  const browse = await browseCafePosts(writer, cafe.cafeId, Number(cafe.menuId), { perPage: 40 });

  if (!browse.success || browse.articles.length === 0) {
    console.log(`    [${cafe.name}] 글 없음`);
    return 0;
  }

  const pool = writer.nickname
    ? browse.articles.filter((a) => a.nickname !== writer.nickname)
    : browse.articles;

  const targets = pickRandomArticles(pool.length > 0 ? pool : browse.articles, Math.min(count, pool.length));
  let succeeded = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const text = COMMENT_TEMPLATES[(seed + i) % COMMENT_TEMPLATES.length];
    const result = await writeCommentWithAccount(writer, cafe.cafeId, target.articleId, text);
    if (result.success) {
      succeeded++;
      console.log(`    [${cafe.name}] 댓글 ✅ #${target.articleId}`);
    } else {
      console.log(`    [${cafe.name}] 댓글 ❌ #${target.articleId} - ${result.error}`);
    }
    if (i < targets.length - 1) await sleep(1500);
  }

  return succeeded;
};

const runCycle = async (
  writers: NaverAccount[],
  cafes: { name: string; cafeId: string; menuId: string }[],
  cycleNum: number,
): Promise<void> => {
  const ts = new Date().toLocaleTimeString('ko-KR');
  console.log(`\n══ 사이클 ${cycleNum} | ${ts} ══`);

  let cycleComments = 0;

  for (let i = 0; i < writers.length; i++) {
    const writer = writers[i];
    console.log(`\n  [${i + 1}/${writers.length}] ${writer.id}`);

    for (const cafe of cafes) {
      const seed = (i + cycleNum) * cafes.length;
      const count = await commentInCafe(writer, cafe, COMMENTS_PER_CAFE, seed);
      cycleComments += count;
      await sleep(2000);
    }
  }

  console.log(`\n  → 사이클 ${cycleNum} 완료: 댓글 ${cycleComments}개`);
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const allCafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafes = TARGET_CAFE_NAMES.map((name) => {
    const found = allCafes.find((c) => c.name === name);
    if (!found) throw new Error(`cafe not found: ${name}`);
    return found;
  });

  const writerAccounts = await Account.find({ userId: user.userId, isActive: true, role: 'writer' })
    .sort({ isMain: -1, createdAt: 1 })
    .lean();
  if (writerAccounts.length === 0) throw new Error('writer 계정 없음');

  const writers = writerAccounts.map(toNaverAccount);

  console.log('═══════════════════════════════════');
  console.log('       글쓴이 등업 웜업 시작');
  console.log('═══════════════════════════════════');
  console.log(`계정: ${writers.length}명`);
  console.log(`대상 카페: ${cafes.map((c) => c.name).join(', ')}`);
  console.log(`카페당 댓글: ${COMMENTS_PER_CAFE}개/writer`);
  console.log(`사이클 간격: ${INTERVAL_MIN}분`);
  console.log(`종료: Ctrl+C`);
  console.log('═══════════════════════════════════');

  let totalComments = 0;

  for (let cycle = 1; ; cycle++) {
    await runCycle(writers, cafes, cycle);
    totalComments += writers.length * cafes.length * COMMENTS_PER_CAFE;

    const nextTime = new Date(Date.now() + INTERVAL_MIN * 60 * 1000);
    console.log(`\n누적 목표 댓글: ~${totalComments}개`);
    console.log(`다음 사이클: ${nextTime.toLocaleTimeString('ko-KR')} (${INTERVAL_MIN}분 후)\n`);
    await sleep(INTERVAL_MIN * 60 * 1000);
  }
};

main().catch(async (e) => {
  console.error('warmup failed:', e);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
