/**
 * 캠페인 큐 추가 스크립트
 *
 * Usage:
 *   CAMPAIGN=chanel LOGIN_ID=21lab npx tsx --env-file=.env.local scripts/run-campaign.ts
 *   CAMPAIGN=shopping LOGIN_ID=21lab npx tsx --env-file=.env.local scripts/run-campaign.ts
 *
 * 샤넬: writer당 광고글 1개 + 일상글 1개 + 사이드(댓글2 좋아요1), commenter → writer 게시글 댓글
 * 쇼핑: writer당 광고글 2개 + 일상글 1개 + 사이드(댓글2 좋아요1), commenter → writer 게시글 댓글
 *
 * writer 순서는 랜덤 셔플, 금일 24시 이내 완료 기준으로 딜레이 분산
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { addTaskJob } from '../src/shared/lib/queue';
import { generateViralContent } from '../src/shared/api/content-api';
import { buildOwnKeywordPrompt } from '../src/features/viral/prompts/build-own-keyword-prompt';
import { buildShortDailyPrompt } from '../src/features/viral/prompts/build-short-daily-prompt';
import { parseViralResponse } from '../src/features/viral/viral-parser';
import type { PostJobData, CommentJobData, LikeJobData, ViralCommentsData } from '../src/shared/lib/queue/types';
import { browseCafePosts, pickRandomArticles } from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateComment } from '../src/shared/api/comment-gen-api';
import type { NaverAccount } from '../src/shared/lib/account-manager';

type CampaignKey = 'chanel' | 'shopping';

interface CampaignConfig {
  defaultCafe: string;
  adKeywords: string[];
  dailyKeywords: string[];
  adPerWriter: number;
  dailyPerWriter: number;
  adCategory: string;
  dailyCategory: string;
}

const CAMPAIGN_CONFIGS: Record<CampaignKey, CampaignConfig> = {
  chanel: {
    defaultCafe: '샤넬오픈런',
    adKeywords: [
      '시아버지생신선물',
      '50대아빠생일선물',
      '어르신선물',
      '환갑잔치선물',
    ],
    dailyKeywords: ['삼일절 연휴', '저녁밥', '야근'],
    adPerWriter: 1,
    dailyPerWriter: 1,
    adCategory: '_ 일상샤반사 📆',
    dailyCategory: '_ 일상샤반사 📆',
  },
  shopping: {
    defaultCafe: '쇼핑지름신',
    adKeywords: [
      '기력회복한약',
      '면역력높이는방법',
      '수족냉증 선물',
      '혈행개선영양제',
      '수족냉증 선물',
      '기력없을때',
    ],
    dailyKeywords: ['날씨', '늦은 저녁식사', '야근 후 퇴근길', '내일날씨따뜻'],
    adPerWriter: 2,
    dailyPerWriter: 1,
    adCategory: '일반 쇼핑후기',
    dailyCategory: '일상톡톡',
  },
};

const MONGODB_URI = process.env.MONGODB_URI;
const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const CAFE_NAME = (process.env.CAFE_NAME || '').trim();
const CAMPAIGN = (process.env.CAMPAIGN || '') as CampaignKey;

const POST_EXEC_BUFFER_MS = 5 * 60 * 1000;
const SIDE_ACTIVITY_BUFFER_MS = 3 * 60 * 1000;

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

const shuffle = <T>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const getMsUntilMidnight = (): number => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 0, 0);
  const remaining = midnight.getTime() - now.getTime();
  return remaining > 0 ? remaining : 60 * 60 * 1000;
};

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : '';
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : '';
};

const generateAdPost = async (keyword: string) => {
  const prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });
  const { content } = await generateViralContent({ prompt });
  const parsed = parseViralResponse(content);
  const title = parsed?.title || parseTitle(content);
  const body = parsed?.body || parseBody(content);
  if (!title || !body) throw new Error(`파싱 실패: "${keyword}"`);
  const viralComments: ViralCommentsData | undefined =
    parsed?.comments?.length ? { comments: parsed.comments } : undefined;
  return { title, body, rawContent: content, viralComments };
};

const generateDailyPost = async (keyword: string) => {
  const prompt = buildShortDailyPrompt({ keyword, keywordType: 'own' });
  const { content } = await generateViralContent({ prompt });
  const parsed = parseViralResponse(content);
  const title = parsed?.title || parseTitle(content);
  const body = parsed?.body || parseBody(content);
  if (!title || !body) throw new Error(`파싱 실패: "${keyword}"`);
  const viralComments: ViralCommentsData | undefined =
    parsed?.comments?.length ? { comments: parsed.comments } : undefined;
  return { title, body, rawContent: content, viralComments };
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
  writerIndex: number,
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
    const commentText = await generateSmartComment(
      naverAccount,
      cafeId,
      target.articleId,
      writerIndex + i
    );

    const delay = baseDelay + (i * SIDE_ACTIVITY_BUFFER_MS);
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
  const likeTargets = pickRandomArticles(
    likePool.length > 0 ? likePool : pool,
    1
  );

  for (const target of likeTargets) {
    const delay = baseDelay + (commentTargets.length * SIDE_ACTIVITY_BUFFER_MS);
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
  if (!CAMPAIGN_CONFIGS[CAMPAIGN]) throw new Error('CAMPAIGN=chanel|shopping 지정 필요');

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const config = CAMPAIGN_CONFIGS[CAMPAIGN];

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true })
    .sort({ isDefault: -1, createdAt: 1 })
    .lean();

  const targetCafeName = CAFE_NAME || config.defaultCafe;
  const cafe = targetCafeName
    ? cafes.find((c) => c.name === targetCafeName)
    : cafes[0];

  if (!cafe) throw new Error(`cafe not found: ${targetCafeName || '(없음)'}`);

  const writerAccounts = await Account.find({
    userId: user.userId,
    isActive: true,
    role: 'writer',
  })
    .sort({ isMain: -1, createdAt: 1 })
    .lean();

  const commenterAccounts = await Account.find({
    userId: user.userId,
    isActive: true,
    role: 'commenter',
  }).lean();

  if (writerAccounts.length === 0) throw new Error('writer 계정 없음');
  const commenterIds = commenterAccounts.map((a) => a.accountId);

  const shuffledWriters = shuffle(writerAccounts);

  const msUntilMidnight = getMsUntilMidnight();
  const writerSlotMs = Math.floor(msUntilMidnight / shuffledWriters.length);

  console.log(`=== ${CAMPAIGN.toUpperCase()} CAMPAIGN ===`);
  console.log(`user: ${LOGIN_ID} (${user.userId})`);
  console.log(`cafe: ${cafe.name} (${cafe.cafeId})`);
  console.log(`writers: ${shuffledWriters.length}명 (셔플됨), commenters: ${commenterAccounts.length}명`);
  console.log(`광고글/writer: ${config.adPerWriter}개, 일상글/writer: ${config.dailyPerWriter}개`);
  console.log(`사이드: 댓글 2개 + 좋아요 1개 / writer`);
  console.log(`deadline: 24:00 (${Math.round(msUntilMidnight / 60000)}분 남음)`);
  console.log(`writer 간격: ${Math.round(writerSlotMs / 60000)}분`);
  console.log('');

  let adIdx = 0;
  let dailyIdx = 0;
  let totalPostJobs = 0;
  let totalSideComments = 0;
  let totalSideLikes = 0;
  let failCount = 0;

  for (let i = 0; i < shuffledWriters.length; i++) {
    const writer = shuffledWriters[i];
    const writerStartMs = i * writerSlotMs;
    const startAt = new Date(Date.now() + writerStartMs);

    console.log(`[${i + 1}/${shuffledWriters.length}] ${writer.accountId} (시작예정: ${startAt.toLocaleTimeString('ko-KR')})`);

    let postOffset = 0;

    // 광고글
    for (let j = 0; j < config.adPerWriter; j++) {
      const keyword = config.adKeywords[adIdx % config.adKeywords.length];
      adIdx++;
      process.stdout.write(`  광고 "${keyword}" ... `);

      try {
        const { title, body, rawContent, viralComments } = await generateAdPost(keyword);
        const postDelay = writerStartMs + postOffset * POST_EXEC_BUFFER_MS;

        const jobData: PostJobData = {
          type: 'post',
          accountId: writer.accountId,
          userId: user.userId,
          cafeId: cafe.cafeId,
          menuId: cafe.menuId,
          subject: title,
          content: body,
          rawContent,
          keyword,
          category: config.adCategory,
          commenterAccountIds: commenterIds,
          viralComments,
        };

        await addTaskJob(writer.accountId, jobData, postDelay);
        totalPostJobs++;
        postOffset++;
        console.log(`✅ [${title.slice(0, 20)}...] (딜레이: ${Math.round(postDelay / 60000)}분)`);
      } catch (e) {
        failCount++;
        console.log(`❌ ${e instanceof Error ? e.message : e}`);
      }
    }

    // 일상글
    for (let j = 0; j < config.dailyPerWriter; j++) {
      const keyword = config.dailyKeywords[dailyIdx % config.dailyKeywords.length];
      dailyIdx++;
      process.stdout.write(`  일상 "${keyword}" ... `);

      try {
        const { title, body, rawContent, viralComments } = await generateDailyPost(keyword);
        const postDelay = writerStartMs + postOffset * POST_EXEC_BUFFER_MS;

        const jobData: PostJobData = {
          type: 'post',
          accountId: writer.accountId,
          userId: user.userId,
          cafeId: cafe.cafeId,
          menuId: cafe.menuId,
          subject: title,
          content: body,
          rawContent,
          keyword,
          category: config.dailyCategory,
          commenterAccountIds: commenterIds,
          viralComments,
        };

        await addTaskJob(writer.accountId, jobData, postDelay);
        totalPostJobs++;
        postOffset++;
        console.log(`✅ [${title.slice(0, 20)}...] (딜레이: ${Math.round(postDelay / 60000)}분)`);
      } catch (e) {
        failCount++;
        console.log(`❌ ${e instanceof Error ? e.message : e}`);
      }
    }

    // 사이드 활동 (글작성 후에 실행)
    try {
      const sideDelay = writerStartMs + postOffset * POST_EXEC_BUFFER_MS + SIDE_ACTIVITY_BUFFER_MS;
      const sideMenuIds = cafe.commentableMenuIds?.length ? cafe.commentableMenuIds : undefined;
      const side = await addSideActivityJobs(writer, cafe.cafeId, cafe.menuId, sideDelay, i, sideMenuIds);
      totalSideComments += side.comments;
      totalSideLikes += side.likes;
    } catch (e) {
      console.log(`  사이드 실패: ${e instanceof Error ? e.message : e}`);
    }

    console.log('');
  }

  console.log('=== 완료 ===');
  console.log(`글 작성: ${totalPostJobs}개 / 실패: ${failCount}개`);
  console.log(`사이드 댓글: ${totalSideComments}개 / 좋아요: ${totalSideLikes}개`);
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('run-campaign failed:', e);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });
