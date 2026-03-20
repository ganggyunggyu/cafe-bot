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
const LOGIN_ID = process.env.LOGIN_ID || "qwzx16";
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
  // 2026-03-20 스케줄 캠페인 (49건) — 쇼핑/샤넬/건강노후/건강관리

  // — 17:40~17:55 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 수납템 정리하다가 장바구니 터짐", category: "일상톡톡", type: "daily", accountId: "loand3324", time: "17:40" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "참붕어즙 효능", category: "자유게시판", type: "ad", accountId: "regular14631", time: "17:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "배란일 임신가능성", category: "일반 쇼핑후기", type: "ad", accountId: "compare14310", time: "17:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소 체질", category: "건강이야기", type: "ad", accountId: "8i2vlbym", time: "17:55" },

  // — 18:00~18:55 —
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "배란기 임신확률", category: "_ 일상샤반사 📆", type: "ad", accountId: "ags2oigb", time: "18:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "김해 흑염소", category: "흑염소진액정보", type: "ad", accountId: "njmzdksm", time: "18:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "계양구 난임병원", category: "_ 일상샤반사 📆", type: "ad", accountId: "wound12567", time: "18:10" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "보건소 임신사전검사", category: "건강이야기", type: "ad", accountId: "0ehz3cb2", time: "18:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "당뇨 흑염소 추천", category: "_ 일상샤반사 📆", type: "ad", accountId: "precede1451", time: "18:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "니프티검사", category: "건강상식", type: "ad", accountId: "suc4dce7", time: "18:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "노산 나이", category: "건강 챌린지", type: "ad", accountId: "xzjmfn3f", time: "18:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "동작산부인과", category: "건강정보", type: "ad", accountId: "8ua1womn", time: "18:45" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "스타벅스 봄 시즌 딸기 라떼 후기 궁금", category: "_ 일상샤반사 📆", type: "daily", accountId: "loand3324", time: "18:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신 준비", category: "오늘의 운동", type: "ad", accountId: "selzze", time: "18:56" },

  // — 19:05~19:55 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 1+1 선크림 뭐 사야 할지 고민중", category: "일상톡톡", type: "daily", accountId: "compare14310", time: "19:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "제주 산후도우미", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "19:15" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신확률 높이는법", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "19:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산산후도우미", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "19:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "동결배아이식 영양제", category: "취미이야기", type: "ad", accountId: "regular14631", time: "19:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "기력회복 한약", category: "자유게시판", type: "ad", accountId: "8i2vlbym", time: "19:55" },

  // — 20:05~20:55 —
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후 호박즙", category: "취미이야기", type: "ad", accountId: "njmzdksm", time: "20:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "위례 산부인과", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "20:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "출산 후 할일", category: "한약재정보", type: "ad", accountId: "0ehz3cb2", time: "20:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "편의점 두바이 쫀득 쿠키 드디어 발견", category: "_ 일상샤반사 📆", type: "daily", accountId: "compare14310", time: "20:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "편도염에 좋은 음식", category: "건강 챌린지", type: "ad", accountId: "suc4dce7", time: "20:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 장바구니 정리하다 3만원 넘김", category: "일상톡톡", type: "daily", accountId: "ags2oigb", time: "20:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "출산 후 종합영양제", category: "건강정보", type: "ad", accountId: "xzjmfn3f", time: "20:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이마트 노브랜드 과자 뭐가 맛있는지 추천 구함", category: "일상톡톡", type: "daily", accountId: "wound12567", time: "20:40" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "광주 산후도우미", category: "건강 관리 후기", type: "ad", accountId: "8ua1womn", time: "20:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "무신사 봄 신상 구경하다가 위시리스트만 늘어남", category: "일상톡톡", type: "daily", accountId: "precede1451", time: "20:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "청주 산후보약 한의원", category: "질문게시판", type: "ad", accountId: "selzze", time: "20:55" },

  // — 21:25~21:56 —
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "배란기 증후군", category: "_ 일상샤반사 📆", type: "ad", accountId: "loand3324", time: "21:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "임신준비 아연", category: "_ 일상샤반사 📆", type: "ad", accountId: "compare14310", time: "21:35" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "배스킨라빈스 이달의맛 먹어본 사람 후기 좀", category: "_ 일상샤반사 📆", type: "daily", accountId: "ags2oigb", time: "21:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "이경재흑염소", category: "흑염소진액정보", type: "ad", accountId: "regular14631", time: "21:46" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "성수동 카페거리 산책하다가 디저트 카페 발견", category: "_ 일상샤반사 📆", type: "daily", accountId: "wound12567", time: "21:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "하남난임센터", category: "자유로운이야기", type: "ad", accountId: "8i2vlbym", time: "21:56" },

  // — 22:05~22:55 —
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "교보문고 베스트셀러 구경하다가 충동구매함", category: "_ 일상샤반사 📆", type: "daily", accountId: "precede1451", time: "22:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "정읍 산부인과 여의사", category: "한약재정보", type: "ad", accountId: "njmzdksm", time: "22:06" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "붕어탕 몸보신", category: "자유로운이야기", type: "ad", accountId: "0ehz3cb2", time: "22:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "60대 여자 선물", category: "건강상식", type: "ad", accountId: "suc4dce7", time: "22:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산모 흑염소 즙", category: "건강 관리 후기", type: "ad", accountId: "xzjmfn3f", time: "22:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "70대 할머니 선물", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "22:40" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "이노시톨 추천", category: "질문게시판", type: "ad", accountId: "8ua1womn", time: "22:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소 당뇨 추천", category: "일반 쇼핑후기", type: "ad", accountId: "compare14310", time: "22:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "익산 산부인과", category: "오늘의 운동", type: "ad", accountId: "selzze", time: "22:55" },

  // — 23:00~23:20 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "산모한테 좋은 음식", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "23:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "강서 산후조리원", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "23:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "제왕절개 회복기간", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "23:20" },
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
