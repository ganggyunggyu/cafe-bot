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
  // 2026-03-23 스케줄 캠페인 (49건) — 쇼핑/샤넬/건강노후/건강관리

  // — 16:45~17:37 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "남편 산전검사", category: "일반 쇼핑후기", type: "ad", accountId: "mixxut", time: "16:45" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "슈폼라떼", category: "_ 일상샤반사 📆", type: "daily", accountId: "ynattg", time: "16:49" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "정읍 산후조리원", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "16:57" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "냥이마들렌", category: "_ 일상샤반사 📆", type: "daily", accountId: "wound12567", time: "17:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "일산 산후조리원", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "17:13" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자연드림 흑염소", category: "자유게시판", type: "ad", accountId: "regular14631", time: "17:21" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "기흥구 산부인과 조리원", category: "건강이야기", type: "ad", accountId: "8i2vlbym", time: "17:29" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후 탈모", category: "흑염소진액정보", type: "ad", accountId: "njmzdksm", time: "17:37" },

  // — 17:45~18:41 —
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에어로카노", category: "_ 일상샤반사 📆", type: "daily", accountId: "mixxut", time: "17:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "화성난임센터", category: "일반 쇼핑후기", type: "ad", accountId: "ynattg", time: "17:53" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "마뗑킴 팝업", category: "_ 일상샤반사 📆", type: "daily", accountId: "ags2oigb", time: "18:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "고함량 알부민", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "18:09" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "두바이초콜릿", category: "_ 일상샤반사 📆", type: "daily", accountId: "precede1451", time: "18:17" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소진액 성분", category: "취미이야기", type: "ad", accountId: "regular14631", time: "18:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "분당차병원 난임센터", category: "한약재정보", type: "ad", accountId: "8i2vlbym", time: "18:33" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "청소년 빈혈 영양제", category: "자유로운이야기", type: "ad", accountId: "njmzdksm", time: "18:41" },

  // — 18:49~19:45 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 꿀템", category: "일상톡톡", type: "daily", accountId: "mixxut", time: "18:49" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "토리든 세럼", category: "_ 일상샤반사 📆", type: "daily", accountId: "ynattg", time: "18:57" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "무신사쿠폰", category: "일상톡톡", type: "daily", accountId: "ags2oigb", time: "19:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클라이맥스 드라마", category: "_ 일상샤반사 📆", type: "daily", accountId: "wound12567", time: "19:13" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올영세일", category: "일상톡톡", type: "daily", accountId: "precede1451", time: "19:21" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "안성난임센터 치료", category: "건강 챌린지", type: "ad", accountId: "0ehz3cb2", time: "19:29" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "계류유산 한약", category: "건강상식", type: "ad", accountId: "suc4dce7", time: "19:37" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산축하선물", category: "건강 관리 후기", type: "ad", accountId: "xzjmfn3f", time: "19:45" },

  // — 19:53~20:49 —
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "월간남친", category: "_ 일상샤반사 📆", type: "daily", accountId: "mixxut", time: "19:53" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "두바이떡", category: "일상톡톡", type: "daily", accountId: "ynattg", time: "20:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "밥 안먹는 아이", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "20:09" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 장바구니", category: "일상톡톡", type: "daily", accountId: "wound12567", time: "20:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "골다공증 주사 부작용", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "20:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "세종 산후도우미", category: "건강정보", type: "ad", accountId: "0ehz3cb2", time: "20:33" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "청궁흑염소", category: "오늘의 운동", type: "ad", accountId: "suc4dce7", time: "20:41" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후풍", category: "질문게시판", type: "ad", accountId: "xzjmfn3f", time: "20:49" },

  // — 20:57~21:29 —
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김소영흑염소", category: "일반 쇼핑후기", type: "ad", accountId: "mixxut", time: "20:57" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "목초농장 흑염소진액", category: "일반 쇼핑후기", type: "ad", accountId: "ynattg", time: "21:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "건물주법", category: "_ 일상샤반사 📆", type: "daily", accountId: "ags2oigb", time: "21:13" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "에스트로겐 수치", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "21:21" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "봄동 비빔밥", category: "_ 일상샤반사 📆", type: "daily", accountId: "precede1451", time: "21:29" },

  // — 21:37~23:05 —
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "시험관 출산예정일", category: "자유게시판", type: "ad", accountId: "8ua1womn", time: "21:37" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "안양 산부인과", category: "건강이야기", type: "ad", accountId: "selzze", time: "21:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "강남여성의원", category: "흑염소진액정보", type: "ad", accountId: "4giccokx", time: "21:53" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후풍 한의원", category: "취미이야기", type: "ad", accountId: "uqgidh2690", time: "22:01" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "창원 리베라 산후조리원", category: "한약재정보", type: "ad", accountId: "eytkgy5500", time: "22:09" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "amh 수치", category: "건강상식", type: "ad", accountId: "yenalk", time: "22:17" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "47세 자연임신", category: "자유로운이야기", type: "ad", accountId: "br5rbg", time: "22:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "난임지원금 신청", category: "건강 챌린지", type: "ad", accountId: "beautifulelephant274", time: "22:33" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "고양 산후조리원", category: "건강 관리 후기", type: "ad", accountId: "8ua1womn", time: "22:41" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 먹는법", category: "건강정보", type: "ad", accountId: "selzze", time: "22:49" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "80대 할머니 선물", category: "오늘의 운동", type: "ad", accountId: "4giccokx", time: "22:57" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "30대 조기폐경", category: "질문게시판", type: "ad", accountId: "uqgidh2690", time: "23:05" },
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
