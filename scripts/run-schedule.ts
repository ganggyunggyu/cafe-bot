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
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
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
  // 2026-03-19 기본값: 쇼핑 ad10+daily5, 샤넬 ad5+daily5, 건노 ad12, 건관 ad12 = 49건
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "친구 출산선물", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "18:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 선물", category: "자유게시판", type: "ad", accountId: "compare14310", time: "18:07" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "광주 난임병원", category: "_ 일상샤반사 📆", type: "ad", accountId: "ags2oigb", time: "18:14" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "난소나이검사 방법", category: "건강이야기", type: "ad", accountId: "wound12567", time: "18:21" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "본정심흑염소 효능", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "18:28" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "진주 난임병원", category: "자유게시판", type: "ad", accountId: "loand3324", time: "18:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아이들 영양제", category: "일반 쇼핑후기", type: "ad", accountId: "compare14310", time: "18:42" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "아기엄마 선물", category: "건강 관리 후기", type: "ad", accountId: "ags2oigb", time: "18:49" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "초록마을 흑염소", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "18:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "8주 계류유산", category: "건강정보", type: "ad", accountId: "precede1451", time: "19:02" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "산후 음식 기력 회복", category: "_ 일상샤반사 📆", type: "ad", accountId: "loand3324", time: "19:09" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산 후 치질", category: "자유로운이야기", type: "ad", accountId: "compare14310", time: "19:16" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소 한마리", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "19:23" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후조리 지원금", category: "한약재정보", type: "ad", accountId: "wound12567", time: "19:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "염소즙 가격 차이", category: "건강 관리 후기", type: "ad", accountId: "precede1451", time: "19:37" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "웰스앤헬스 흑염소", category: "취미이야기", type: "ad", accountId: "loand3324", time: "19:44" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "90대 할머니 선물", category: "_ 일상샤반사 📆", type: "ad", accountId: "compare14310", time: "19:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 병원", category: "건강상식", type: "ad", accountId: "ags2oigb", time: "19:57" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Boy CHANEL이랑 클래식 11.12 중 첫 가방 뭐가 나을지 계속 검색", category: "_ 일상샤반사 📆", type: "daily", accountId: "wound12567", time: "20:04" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "흑염소진액 먹는법", category: "_ 일상샤반사 📆", type: "ad", accountId: "precede1451", time: "20:11" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "브링그린 안경만두 콜라보 티트리 시카 토너 올영세일 장바구니에 담아둠", category: "일상톡톡", type: "daily", accountId: "loand3324", time: "20:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "45세 임신 확률", category: "흑염소진액정보", type: "ad", accountId: "compare14310", time: "20:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 2026 봄여름 프리컬렉션 밝은 트위드 체크 계속 아른거림", category: "_ 일상샤반사 📆", type: "daily", accountId: "ags2oigb", time: "20:32" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "40세 임신 가능성", category: "일반 쇼핑후기", type: "ad", accountId: "wound12567", time: "20:39" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 원더풀스 라인업 보고 주말 정주행 리스트 적는 중", category: "일상톡톡", type: "daily", accountId: "precede1451", time: "20:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "와이프 출산선물", category: "흑염소진액정보", type: "ad", accountId: "loand3324", time: "20:52" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "브링그린 대나무 히알루 립 에센스 2입 기획 보고 또 올영 들어가는 중", category: "일상톡톡", type: "daily", accountId: "compare14310", time: "20:59" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후도우미 지원기간", category: "오늘의 운동", type: "ad", accountId: "ags2oigb", time: "21:06" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기치료제", category: "자유로운이야기", type: "ad", accountId: "wound12567", time: "21:13" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "김포 흑염소 맛집", category: "질문게시판", type: "ad", accountId: "precede1451", time: "21:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "계류유산 증상", category: "일반 쇼핑후기", type: "ad", accountId: "loand3324", time: "21:27" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "사하구 산부인과", category: "건강 챌린지", type: "ad", accountId: "compare14310", time: "21:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "53세 임신", category: "일반 쇼핑후기", type: "ad", accountId: "ags2oigb", time: "21:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "시험관 주사 통증", category: "_ 일상샤반사 📆", type: "ad", accountId: "wound12567", time: "21:47" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "e보건소 가임력검사", category: "오늘의 운동", type: "ad", accountId: "precede1451", time: "21:54" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소보감탕", category: "건강이야기", type: "ad", accountId: "loand3324", time: "22:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "6주 계류유산 증상", category: "일반 쇼핑후기", type: "ad", accountId: "compare14310", time: "22:08" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "60대 엄마 생신선물", category: "질문게시판", type: "ad", accountId: "ags2oigb", time: "22:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "서울 난임병원", category: "건강상식", type: "ad", accountId: "wound12567", time: "22:22" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "남구 산후조리원", category: "일반 쇼핑후기", type: "ad", accountId: "precede1451", time: "22:29" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25 백 사진만 계속 넘겨보다가 퇴근길 끝남", category: "_ 일상샤반사 📆", type: "daily", accountId: "loand3324", time: "22:35" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 22랑 CHANEL 31 미니 쇼핑백 중 뭐가 데일리인지 아직도 고민", category: "_ 일상샤반사 📆", type: "daily", accountId: "compare14310", time: "22:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 월간남친 틀어놓고 간식 고르다가 밤 다 감", category: "일상톡톡", type: "daily", accountId: "ags2oigb", time: "22:49" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 이 사랑 통역 되나요 다시보기 시작해서 저녁 루틴 밀림", category: "일상톡톡", type: "daily", accountId: "wound12567", time: "22:56" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25 백이랑 2026 프리컬렉션 쇼핑백 실루엣 비교하다가 시간 순삭", category: "_ 일상샤반사 📆", type: "daily", accountId: "precede1451", time: "23:03" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "인공수정 시험관 차이", category: "한약재정보", type: "ad", accountId: "loand3324", time: "23:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "나팔관조영술 실비", category: "건강정보", type: "ad", accountId: "compare14310", time: "23:17" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "몸을 따뜻하게 하는 음식", category: "취미이야기", type: "ad", accountId: "ags2oigb", time: "23:24" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산후 허리통증", category: "건강 챌린지", type: "ad", accountId: "wound12567", time: "23:30" },
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
      const prompt =
        item.type === "ad"
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
