/**
 * 스케줄 큐 추가 스크립트
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-schedule.ts
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { addTaskJob } from '../src/shared/lib/queue';
import { generateViralContent } from '../src/shared/api/content-api';
import { buildOwnKeywordPrompt } from '../src/features/viral/prompts/build-own-keyword-prompt';
import { buildShortDailyPrompt } from '../src/features/viral/prompts/build-short-daily-prompt';
import { browseCafePosts, pickRandomArticles } from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateComment } from '../src/shared/api/comment-gen-api';
import { parseViralResponse } from '../src/features/viral/viral-parser';
import type { PostJobData, CommentJobData, LikeJobData, ViralCommentsData } from '../src/shared/lib/queue/types';
import type { NaverAccount } from '../src/shared/lib/account-manager';

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const SIDE_ACTIVITY_BUFFER_MS = 3 * 60 * 1000;

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  keyword: string;
  category: string;
  type: 'ad' | 'daily';
  accountId: string;
  time: string; // "HH:MM"
}

const SCHEDULE: ScheduleItem[] = [
  // 14:30~21:42 / 18분 간격 / 계정별 90분 간격 / 쇼핑+샤넬 혼합
  // 쇼핑지름신 계정당 ad2+daily1 / 샤넬오픈런 계정당 ad1+daily1
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '키크는음식',                           category: '일반 쇼핑후기',    type: 'ad',    accountId: 'compare14310', time: '14:30' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '햇생강',                               category: '일반 쇼핑후기',    type: 'ad',    accountId: 'fail5644',     time: '14:48' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '오후 나른해서 커피 마시는 중',          category: '일상톡톡',         type: 'daily', accountId: 'loand3324',    time: '15:06' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '22백 베이지랑 블랙 고민됨',             category: '_ 일상샤반사 📆', type: 'daily', accountId: 'dyulp',        time: '15:24' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '원기회복음식',                          category: '_ 일상샤반사 📆', type: 'ad',    accountId: 'gmezz',        time: '15:42' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '퇴근 전 이 시간이 제일 힘들어',         category: '일상톡톡',         type: 'daily', accountId: 'compare14310', time: '16:00' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '임산부에게좋은음식',                    category: '_ 일상샤반사 📆', type: 'ad',    accountId: 'fail5644',     time: '16:18' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '산모 음식',                             category: '일반 쇼핑후기',    type: 'ad',    accountId: 'loand3324',    time: '16:36' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '왕과사는남자 오늘 보러 가기로 했는데 기대됨', category: '일상톡톡',    type: 'daily', accountId: 'dyulp',        time: '16:54' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '퀘르세틴브로멜라인',                    category: '일반 쇼핑후기',    type: 'ad',    accountId: 'gmezz',        time: '17:12' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '클래식 플랩 미디움 드디어 받았어',       category: '_ 일상샤반사 📆', type: 'daily', accountId: 'compare14310', time: '17:30' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '생칡즙',                                category: '일반 쇼핑후기',    type: 'ad',    accountId: 'fail5644',     time: '17:48' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '보이샤넬 스몰이랑 미디움 비교해봤는데',  category: '_ 일상샤반사 📆', type: 'daily', accountId: 'loand3324',    time: '18:06' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '고단백질음식',                          category: '일반 쇼핑후기',    type: 'ad',    accountId: 'dyulp',        time: '18:24' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '퇴근하고 왕과사는남자 봤는데 진짜 재밌었다', category: '일상톡톡',    type: 'daily', accountId: 'gmezz',        time: '18:42' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '젤리스틱',                              category: '일반 쇼핑후기',    type: 'ad',    accountId: 'compare14310', time: '19:00' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: 'WOC 블랙 골드 매일 쓰게 됨',            category: '_ 일상샤반사 📆', type: 'daily', accountId: 'fail5644',     time: '19:18' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '유기농레몬생강즙',                       category: '_ 일상샤반사 📆', type: 'ad',    accountId: 'loand3324',    time: '19:36' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '비타민B음식',                           category: '일반 쇼핑후기',    type: 'ad',    accountId: 'dyulp',        time: '19:54' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '왕과사는남자 보고 나서 미니 플랩 사고 싶어짐', category: '_ 일상샤반사 📆', type: 'daily', accountId: 'gmezz', time: '20:12' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '임산부 음식 추천',                       category: '_ 일상샤반사 📆', type: 'ad',    accountId: 'compare14310', time: '20:30' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '야식 생각나는 밤',                       category: '일상톡톡',         type: 'daily', accountId: 'fail5644',     time: '20:48' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '시나몬차',                               category: '일반 쇼핑후기',    type: 'ad',    accountId: 'loand3324',    time: '21:06' },
  { cafe: '샤넬오픈런', cafeId: '25460974', keyword: '임산부 금지음식',                        category: '_ 일상샤반사 📆', type: 'ad',    accountId: 'dyulp',        time: '21:24' },
  { cafe: '쇼핑지름신', cafeId: '25729954', keyword: '아연이많은음식',                         category: '일반 쇼핑후기',    type: 'ad',    accountId: 'gmezz',        time: '21:42' },
];

const COMMENT_TEMPLATES = [
  '좋은 정보 감사합니다. 참고해볼게요.',
  '저도 비슷하게 느꼈는데 정리 잘해주셨네요.',
  '경험 공유 감사합니다. 도움이 됐어요.',
  '내용이 깔끔해서 이해하기 편했어요.',
  '실사용 관점에서 도움 되는 글이네요.',
  '핵심만 잘 정리돼서 바로 참고했어요.',
  '저랑 상황이 비슷해서 공감하면서 읽었습니다.',
  '정성글 감사합니다. 다음 글도 기대할게요.',
];

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : '';
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : '';
};

const getDelayMs = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const delay = target.getTime() - Date.now();
  return Math.max(delay, 0);
};

const generateSmartComment = async (
  writer: NaverAccount,
  cafeId: string,
  articleId: number,
  fallbackIndex: number
): Promise<string> => {
  const fallback = COMMENT_TEMPLATES[fallbackIndex % COMMENT_TEMPLATES.length];
  try {
    const article = await readCafeArticleContent(writer, cafeId, articleId);
    if (!article.success || !article.content) return fallback;
    const postContext = article.title
      ? `${article.title}\n\n${article.content}`
      : article.content;
    const generated = await generateComment(postContext, null, article.authorNickname);
    return generated.trim() || fallback;
  } catch {
    return fallback;
  }
};

const addSideActivityJobs = async (
  writer: { accountId: string; password: string; nickname?: string },
  cafeId: string,
  menuId: string,
  baseDelay: number,
  idx: number,
  commentableMenuIds?: number[],
): Promise<{ comments: number; likes: number }> => {
  const naverAccount: NaverAccount = {
    id: writer.accountId,
    password: writer.password,
    nickname: writer.nickname,
  };

  const useCommentableFilter = commentableMenuIds && commentableMenuIds.length > 0;
  const browseMenuId = useCommentableFilter ? undefined : Number(menuId);
  const browse = await browseCafePosts(naverAccount, cafeId, browseMenuId, { perPage: 40 });
  if (!browse.success || browse.articles.length === 0) {
    console.log(`    사이드: 글 없음 - 스킵`);
    return { comments: 0, likes: 0 };
  }

  const menuFilteredSet = useCommentableFilter ? new Set(commentableMenuIds) : null;
  const menuFiltered = menuFilteredSet
    ? browse.articles.filter((a) => menuFilteredSet.has(a.menuId))
    : browse.articles;

  const filtered = writer.nickname
    ? menuFiltered.filter((a) => a.nickname !== writer.nickname)
    : menuFiltered;
  const pool = filtered.length > 0 ? filtered : menuFiltered.length > 0 ? menuFiltered : browse.articles;

  let commentCount = 0;
  let likeCount = 0;

  const commentTargets = pickRandomArticles(pool, Math.min(2, pool.length));
  for (let i = 0; i < commentTargets.length; i++) {
    const target = commentTargets[i];
    const commentText = await generateSmartComment(naverAccount, cafeId, target.articleId, idx + i);
    const delay = baseDelay + i * SIDE_ACTIVITY_BUFFER_MS;
    const commentJob: CommentJobData = {
      type: 'comment',
      accountId: writer.accountId,
      cafeId,
      articleId: target.articleId,
      content: commentText,
    };
    await addTaskJob(writer.accountId, commentJob, delay);
    commentCount++;
    console.log(`    사이드 댓글 #${target.articleId} (딜레이: ${Math.round(delay / 60000)}분)`);
  }

  const commentedIds = new Set(commentTargets.map((t) => t.articleId));
  const likePool = pool.filter((a) => !commentedIds.has(a.articleId));
  const likeTargets = pickRandomArticles(likePool.length > 0 ? likePool : pool, 1);

  for (const target of likeTargets) {
    const delay = baseDelay + commentTargets.length * SIDE_ACTIVITY_BUFFER_MS;
    const likeJob: LikeJobData = {
      type: 'like',
      accountId: writer.accountId,
      cafeId,
      articleId: target.articleId,
    };
    await addTaskJob(writer.accountId, likeJob, delay);
    likeCount++;
    console.log(`    사이드 좋아요 #${target.articleId} (딜레이: ${Math.round(delay / 60000)}분)`);
  }

  return { comments: commentCount, likes: likeCount };
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c]));

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  const commenterIds = accounts.filter((a) => a.role === 'commenter').map((a) => a.accountId);

  console.log(`=== 스케줄 큐 추가 ===`);
  console.log(`user: ${LOGIN_ID} / writers: ${SCHEDULE.length}건 / commenters: ${commenterIds.length}명\n`);

  let totalPosts = 0;
  let failCount = 0;
  let totalSideComments = 0;
  let totalSideLikes = 0;

  const sortedSchedule = [...SCHEDULE].sort((a, b) => a.time.localeCompare(b.time));

  // 사이드 활동 추적 (계정+카페 조합별 1회)
  const sideActivityDone = new Set<string>();

  for (const item of sortedSchedule) {
    const delayMs = getDelayMs(item.time);
    const cafe = cafeMap.get(item.cafeId);
    if (!cafe) {
      console.log(`❌ 카페 없음: ${item.cafeId}`);
      failCount++;
      continue;
    }

    const account = accountMap.get(item.accountId);
    if (!account) {
      console.log(`❌ 계정 없음: ${item.accountId}`);
      failCount++;
      continue;
    }

    const typeLabel = item.type === 'ad' ? '광고' : '일상';
    process.stdout.write(`[${item.time}] ${item.cafe} ${item.accountId} ${typeLabel} "${item.keyword}" ... `);

    try {
      const prompt = item.type === 'ad'
        ? buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: 'own' })
        : buildShortDailyPrompt({ keyword: item.keyword, keywordType: 'own' });

      const { content } = await generateViralContent({ prompt, model: 'gemini-3.1-pro-preview' });
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);
      if (!title || !body) throw new Error(`파싱 실패`);

      const viralComments: ViralCommentsData | undefined =
        parsed?.comments?.length
          ? { comments: parsed.comments }
          : undefined;

      const jobData: PostJobData = {
        type: 'post',
        accountId: item.accountId,
        userId: user.userId,
        cafeId: item.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: body,
        rawContent: content,
        keyword: item.keyword,
        category: item.category,
        commenterAccountIds: commenterIds,
        viralComments,
      };

      await addTaskJob(item.accountId, jobData, delayMs);
      totalPosts++;
      console.log(`✅ [${title.slice(0, 25)}...] (${Math.round(delayMs / 60000)}분 후)`);
    } catch (e) {
      failCount++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('\n=== 완료 ===');
  console.log(`글 작성: ${totalPosts}건 / 실패: ${failCount}건`);
  console.log(`사이드 댓글: ${totalSideComments}건 / 좋아요: ${totalSideLikes}건`);
};

main()
  .then(async () => {
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('run-schedule failed:', e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
