/**
 * 샤넬 카페 활동 — compare14310, gmezz, fail5644 전용 (재등록)
 * Usage: npx tsx --env-file=.env.local scripts/schedule-chanel-fix.ts
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
const COMMENTS = 15;
const LIKES = 5;
const GAP = { min: 4, max: 8 };
const TARGET_IDS = ['compare14310', 'gmezz', 'fail5644'];

const CAFE = {
  name: '샤넬오픈런',
  cafeUrl: 'shoppingtpw',
  allowed: new Set([60, 42, 95, 112, 72, 99, 136, 84, 34, 70, 148, 85, 86, 125, 87, 52]),
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

const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T>(a: T[]): T[] => {
  const s = [...a];
  for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
  return s;
};

const smart = async (w: NaverAccount, cafeId: string, articleId: number): Promise<string> => {
  const fb = pick(FALLBACKS);
  try {
    const a = await readCafeArticleContent(w, cafeId, articleId);
    if (!a.success || !a.content) return fb;
    const ctx = a.title ? `${a.title}\n\n${a.content}` : a.content;
    const g = await generateComment(`${ctx}\n\n[지시] 반드시 존댓말로 작성할 것. 반말 금지. 짧고 자연스럽게.`, null, a.authorNickname);
    return g.trim() || fb;
  } catch { return fb; }
};

const main = async () => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const dbCafe = await Cafe.findOne({ userId: user.userId, name: CAFE.name, isActive: true }).lean();
  if (!dbCafe) throw new Error(`카페 없음: ${CAFE.name}`);
  const cafeId = dbCafe.cafeId;

  const allWriters = await Account.find({ userId: user.userId, isActive: true, role: 'writer' }).lean();
  const writers = allWriters.filter((w) => TARGET_IDS.includes(w.accountId));
  if (writers.length === 0) throw new Error('대상 writer 없음');

  const first: NaverAccount = { id: writers[0].accountId, password: writers[0].password, nickname: writers[0].nickname };

  console.log(`[BROWSE] 글 확보 중...`);
  const arts: CafeArticle[] = [];
  const seen = new Set<number>();
  for (let p = 1; arts.length < 100 && p <= 8; p++) {
    const r = await browseCafePosts(first, cafeId, undefined, { page: p, perPage: 20, cafeUrl: CAFE.cafeUrl });
    if (!r.success || !r.articles.length) break;
    r.articles.filter((a) => CAFE.allowed.has(a.menuId) && !seen.has(a.articleId)).forEach((a) => { seen.add(a.articleId); arts.push(a); });
    console.log(`  page ${p}: 누적 ${arts.length}개`);
  }
  if (!arts.length) throw new Error('글 없음');

  const articles = shuffle(arts);
  const used = new Set<string>();
  let tC = 0, tL = 0;

  console.log(`\n=== ${writers.length}명 등록 시작 ===\n`);

  for (const w of writers) {
    const acc: NaverAccount = { id: w.accountId, password: w.password, nickname: w.nickname };
    console.log(`[${w.accountId}] (${w.nickname})`);
    let delay = 0;

    const avail = articles.filter((a) => !used.has(`${cafeId}:${a.articleId}`) && a.nickname !== w.nickname);

    const ct = avail.slice(0, COMMENTS);
    for (const t of ct) {
      used.add(`${cafeId}:${t.articleId}`);
      const txt = await smart(acc, cafeId, t.articleId);
      const job: CommentJobData = { type: 'comment', accountId: w.accountId, cafeId, articleId: t.articleId, content: txt };
      await addTaskJob(w.accountId, job, delay);
      tC++;
      console.log(`  댓글 #${t.articleId} (${Math.round(delay / 60000)}분)`);
      delay += (GAP.min + Math.random() * (GAP.max - GAP.min)) * 60000;
    }

    const cIds = new Set(ct.map((t) => t.articleId));
    const lt = avail.filter((a) => !cIds.has(a.articleId)).slice(0, LIKES);
    for (const t of lt) {
      used.add(`${cafeId}:${t.articleId}`);
      const job: LikeJobData = { type: 'like', accountId: w.accountId, cafeId, articleId: t.articleId };
      await addTaskJob(w.accountId, job, delay);
      tL++;
      console.log(`  좋아요 #${t.articleId} (${Math.round(delay / 60000)}분)`);
      delay += (GAP.min + Math.random() * (GAP.max - GAP.min)) * 60000;
    }
    console.log(`  → ${Math.round(delay / 60000)}분 (${(delay / 3600000).toFixed(1)}h)\n`);
  }

  console.log(`=== 완료: 댓글 ${tC} / 좋아요 ${tL} ===`);
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error('failed:', e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
