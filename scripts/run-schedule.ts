/**
 * 스케줄 큐 추가 스크립트
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-schedule.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import {
  browseCafePosts,
  pickRandomArticles,
} from "../src/shared/lib/cafe-browser";
import { readCafeArticleContent } from "../src/shared/lib/cafe-article-reader";
import { generateComment } from "../src/shared/api/comment-gen-api";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type {
  PostJobData,
  CommentJobData,
  LikeJobData,
  ViralCommentsData,
} from "../src/shared/lib/queue/types";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const SIDE_ACTIVITY_BUFFER_MS = 3 * 60 * 1000;

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  keyword: string;
  category: string;
  type: "ad" | "daily";
  accountId: string;
  time: string; // "HH:MM"
}

const SCHEDULE: ScheduleItem[] = [
  // 2026-03-21 스케줄 캠페인 (39건) — 쇼핑/샤넬/건강노후/건강관리

  // — 14:20~14:50 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타벅스 에어로카노 마셔봤는데 진짜 거품이 신기함", category: "일상톡톡", type: "daily", accountId: "ags2oigb", time: "14:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "청라동 보양탕", category: "자유게시판", type: "ad", accountId: "regular14631", time: "14:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "이마트24 말차크림롤 먹어봤는데 말차 맛 제대로임", category: "_ 일상샤반사 📆", type: "daily", accountId: "wound12567", time: "14:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "폐경후 생리", category: "건강이야기", type: "ad", accountId: "8i2vlbym", time: "14:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "당뇨환자 흑염소", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "14:50" },

  // — 15:05~16:45 —
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어린이 흑염소", category: "흑염소진액정보", type: "ad", accountId: "njmzdksm", time: "15:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "미추홀구산부인과", category: "건강이야기", type: "ad", accountId: "0ehz3cb2", time: "15:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "고용량 엽산", category: "건강상식", type: "ad", accountId: "suc4dce7", time: "15:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "손이 차가운 이유", category: "건강 챌린지", type: "ad", accountId: "xzjmfn3f", time: "16:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "e보건소 산전검사 병원", category: "건강정보", type: "ad", accountId: "8ua1womn", time: "16:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "임신 잘되는 한약", category: "_ 일상샤반사 📆", type: "ad", accountId: "ags2oigb", time: "16:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "강서구 산후도우미", category: "오늘의 운동", type: "ad", accountId: "selzze", time: "16:45" },

  // — 16:50~17:45 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 안면홍조", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "16:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 블루투스 스피커 품절이길래 결국 온라인 주문함", category: "일상톡톡", type: "daily", accountId: "precede1451", time: "17:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "난임시술비 지원", category: "취미이야기", type: "ad", accountId: "regular14631", time: "17:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "개구리즙 효능", category: "자유게시판", type: "ad", accountId: "8i2vlbym", time: "17:45" },

  // — 18:05~19:45 —
  { cafe: "건강관리소", cafeId: "25227349", keyword: "대구 산후보약", category: "취미이야기", type: "ad", accountId: "njmzdksm", time: "18:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후 붓기차", category: "한약재정보", type: "ad", accountId: "0ehz3cb2", time: "18:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신전 체질 관리", category: "건강 챌린지", type: "ad", accountId: "suc4dce7", time: "18:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "시험관 시술 비용", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "18:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "여자 흑염소", category: "_ 일상샤반사 📆", type: "ad", accountId: "wound12567", time: "19:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "의왕 산후도우미", category: "건강정보", type: "ad", accountId: "xzjmfn3f", time: "19:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "올리브영 토리든 세럼 1+1 할 때 안 사면 후회함", category: "_ 일상샤반사 📆", type: "daily", accountId: "precede1451", time: "19:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "50살 임신", category: "건강 관리 후기", type: "ad", accountId: "8ua1womn", time: "19:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "7주 계류유산 증상", category: "질문게시판", type: "ad", accountId: "selzze", time: "19:45" },

  // — 20:25~21:45 —
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 먹는 시간", category: "흑염소진액정보", type: "ad", accountId: "regular14631", time: "20:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "강북 산부인과", category: "자유로운이야기", type: "ad", accountId: "8i2vlbym", time: "20:45" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CU 스스스 우유샌드 설향 딸기 진짜 맛있는지 궁금", category: "_ 일상샤반사 📆", type: "daily", accountId: "ags2oigb", time: "21:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "영양식 추천", category: "한약재정보", type: "ad", accountId: "njmzdksm", time: "21:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓직구 쿠폰 쓰려고 장바구니 또 채움", category: "일상톡톡", type: "daily", accountId: "wound12567", time: "21:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "건강원 흑염소", category: "자유로운이야기", type: "ad", accountId: "0ehz3cb2", time: "21:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "임신중독증 원인", category: "_ 일상샤반사 📆", type: "ad", accountId: "precede1451", time: "21:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임산부 선물", category: "건강상식", type: "ad", accountId: "suc4dce7", time: "21:45" },

  // — 22:05~23:25 —
  { cafe: "건강관리소", cafeId: "25227349", keyword: "의정부 산후조리원", category: "건강 관리 후기", type: "ad", accountId: "xzjmfn3f", time: "22:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후풍 증상 후유증", category: "질문게시판", type: "ad", accountId: "8ua1womn", time: "22:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "5일배양 피검사", category: "오늘의 운동", type: "ad", accountId: "selzze", time: "22:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 한약 산후 회복", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "23:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "삼성동 난임병원", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "23:15" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 호르몬치료", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "23:25" },
];

const COMMENT_TEMPLATES = [
  "좋은 정보 감사합니다. 참고해볼게요.",
  "저도 비슷하게 느꼈는데 정리 잘해주셨네요.",
  "경험 공유 감사합니다. 도움이 됐어요.",
  "내용이 깔끔해서 이해하기 편했어요.",
  "실사용 관점에서 도움 되는 글이네요.",
  "핵심만 잘 정리돼서 바로 참고했어요.",
  "저랑 상황이 비슷해서 공감하면서 읽었습니다.",
  "정성글 감사합니다. 다음 글도 기대할게요.",
];

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const getDelayMs = (timeStr: string): number => {
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const delay = target.getTime() - Date.now();
  return Math.max(delay, 0);
};

const generateSmartComment = async (
  writer: NaverAccount,
  cafeId: string,
  articleId: number,
  fallbackIndex: number,
): Promise<string> => {
  const fallback = COMMENT_TEMPLATES[fallbackIndex % COMMENT_TEMPLATES.length];
  try {
    const article = await readCafeArticleContent(writer, cafeId, articleId);
    if (!article.success || !article.content) return fallback;
    const postContext = article.title
      ? `${article.title}\n\n${article.content}`
      : article.content;
    const generated = await generateComment(
      postContext,
      null,
      article.authorNickname,
    );
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

  const useCommentableFilter =
    commentableMenuIds && commentableMenuIds.length > 0;
  const browseMenuId = useCommentableFilter ? undefined : Number(menuId);
  const browse = await browseCafePosts(naverAccount, cafeId, browseMenuId, {
    perPage: 40,
  });
  if (!browse.success || browse.articles.length === 0) {
    console.log(`    사이드: 글 없음 - 스킵`);
    return { comments: 0, likes: 0 };
  }

  const menuFilteredSet = useCommentableFilter
    ? new Set(commentableMenuIds)
    : null;
  const menuFiltered = menuFilteredSet
    ? browse.articles.filter((a) => menuFilteredSet.has(a.menuId))
    : browse.articles;

  const filtered = writer.nickname
    ? menuFiltered.filter((a) => a.nickname !== writer.nickname)
    : menuFiltered;
  const pool =
    filtered.length > 0
      ? filtered
      : menuFiltered.length > 0
        ? menuFiltered
        : browse.articles;

  let commentCount = 0;
  let likeCount = 0;

  const commentTargets = pickRandomArticles(pool, Math.min(2, pool.length));
  for (let i = 0; i < commentTargets.length; i++) {
    const target = commentTargets[i];
    const commentText = await generateSmartComment(
      naverAccount,
      cafeId,
      target.articleId,
      idx + i,
    );
    const delay = baseDelay + i * SIDE_ACTIVITY_BUFFER_MS;
    const commentJob: CommentJobData = {
      type: "comment",
      accountId: writer.accountId,
      cafeId,
      articleId: target.articleId,
      content: commentText,
    };
    await addTaskJob(writer.accountId, commentJob, delay);
    commentCount++;
    console.log(
      `    사이드 댓글 #${target.articleId} (딜레이: ${Math.round(delay / 60000)}분)`,
    );
  }

  const commentedIds = new Set(commentTargets.map((t) => t.articleId));
  const likePool = pool.filter((a) => !commentedIds.has(a.articleId));
  const likeTargets = pickRandomArticles(
    likePool.length > 0 ? likePool : pool,
    1,
  );

  for (const target of likeTargets) {
    const delay = baseDelay + commentTargets.length * SIDE_ACTIVITY_BUFFER_MS;
    const likeJob: LikeJobData = {
      type: "like",
      accountId: writer.accountId,
      cafeId,
      articleId: target.articleId,
    };
    await addTaskJob(writer.accountId, likeJob, delay);
    likeCount++;
    console.log(
      `    사이드 좋아요 #${target.articleId} (딜레이: ${Math.round(delay / 60000)}분)`,
    );
  }

  return { comments: commentCount, likes: likeCount };
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c]));

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  const commenterIds = accounts
    .filter((a) => a.role === "commenter")
    .map((a) => a.accountId);

  console.log(`=== 스케줄 큐 추가 ===`);
  console.log(
    `user: ${LOGIN_ID} / writers: ${SCHEDULE.length}건 / commenters: ${commenterIds.length}명\n`,
  );

  let totalPosts = 0;
  let failCount = 0;
  let totalSideComments = 0;
  let totalSideLikes = 0;

  const sortedSchedule = [...SCHEDULE].sort((a, b) =>
    a.time.localeCompare(b.time),
  );

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

    const typeLabel = item.type === "ad" ? "광고" : "일상";
    process.stdout.write(
      `[${item.time}] ${item.cafe} ${item.accountId} ${typeLabel} "${item.keyword}" ... `,
    );

    try {
      const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
      const prompt =
        contentStyle !== '정보'
          ? buildViralPrompt({ keyword: item.keyword, keywordType: "own" }, contentStyle)
          : item.type === "ad"
            ? buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" })
            : buildShortDailyPrompt({
                keyword: item.keyword,
                keywordType: "own",
              });

      const { content } = await generateViralContent({
        prompt,
        // model은 text-gen-hub의 cafe_total_service DEFAULT_MODEL 사용
      });
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);
      if (!title || !body) throw new Error(`파싱 실패`);

      const viralComments: ViralCommentsData | undefined = parsed?.comments
        ?.length
        ? { comments: parsed.comments }
        : undefined;

      const jobData: PostJobData = {
        type: "post",
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
      console.log(
        `✅ [${title.slice(0, 25)}...] (${Math.round(delayMs / 60000)}분 후)`,
      );
    } catch (e) {
      failCount++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n=== 완료 ===");
  console.log(`글 작성: ${totalPosts}건 / 실패: ${failCount}건`);
  console.log(
    `사이드 댓글: ${totalSideComments}건 / 좋아요: ${totalSideLikes}건`,
  );
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("run-schedule failed:", e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
