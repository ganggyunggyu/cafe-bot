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
import { buildCompetitorKeywordPrompt } from "../src/features/viral/prompts/build-competitor-keyword-prompt";
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
  type: "ad" | "daily" | "daily-ad";
  keywordType?: "own" | "competitor";
  accountId: string;
  time: string; // "HH:MM"
}

const SCHEDULE: ScheduleItem[] = [
  // 2026-04-07 캠페인 37건 (16:45~23:00)
  // 쇼핑: ad10(타6+자4)+daily5 | 샤넬: daily5+daily-ad5 | 건강노후: ad6 | 건강관리: ad6

  // === 쇼핑지름신 (15건: ad10 + daily5) ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "메가커피 꿀복숭아 아이스티 마셨는데 생각보다 안 달아서 좋았음", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "16:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "정식품 베지밀 고단백두유 검은콩", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "eytkgy5500", time: "17:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어린이 면역력 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "17:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타필드 하남 돌다가 뉴발란스 운동화만 오래 봄", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "18:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "닥터파이토 덴티백 PRO 구강유산균 M18", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "yenalk", time: "18:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "60대 엄마 생일선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "19:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "종근당건강 프로메가 알티지 오메가3 비타민D", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "eytkgy5500", time: "19:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "JTBC 모두가 자신의 무가치함과 싸우고 있다 티저 보다가 몰입됨", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "20:15" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "20:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "지그재그 앱 켜자마자 봄 아우터만 한참 넘겨봄", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "20:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "락토핏 맥스19 유산균", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "olgdmp9921", time: "22:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "SBS 오늘도 매진했습니다 티저 보고 야식 검색하다가 시간 감", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "22:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "키크는 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "22:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김오곤 프리미엄 마가목 흑염소 진액", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "uqgidh2690", time: "22:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "164 루테인지아잔틴GR", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "4giccokx", time: "23:00" },

  // === 샤넬오픈런 (10건: daily5 + daily-ad5) ===
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "지그재그 직잭세일 보다가 샤넬 25K 플랩백 코디 저장해둠", category: "일상샤반사", type: "daily-ad", accountId: "yenalk", time: "17:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "H&M 봄 셔츠 원피스 색감 괜찮아서 장바구니 넣음", category: "일상샤반사", type: "daily", accountId: "olgdmp9921", time: "17:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "올리브영에서 롬앤 틴트 색상표 다시 비교함", category: "일상샤반사", type: "daily", accountId: "eytkgy5500", time: "18:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "SBS 오늘도 매진했습니다 티저 보고 퇴근룩 자켓 검색함", category: "일상샤반사", type: "daily-ad", accountId: "uqgidh2690", time: "19:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "무신사 스탠다드 카디건 후기 보다가 베이지에 꽂힘", category: "일상샤반사", type: "daily", accountId: "4giccokx", time: "19:20" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25S 메리제인 후기 영상보다가 굽 높이만 한참 봄", category: "일상샤반사", type: "daily", accountId: "yenalk", time: "19:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "마뗑킴 카드지갑 재입고 알림 보다가 샤넬 미니백 생각남", category: "일상샤반사", type: "daily-ad", accountId: "olgdmp9921", time: "20:35" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "JTBC 모두가 자신의 무가치함과 싸우고 있다 포스터 보니 블랙 트위드만 눈에 들어옴", category: "일상샤반사", type: "daily-ad", accountId: "eytkgy5500", time: "21:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "COS 매장 들렀다가 봄 트렌치 핏이 괜찮았음", category: "일상샤반사", type: "daily", accountId: "uqgidh2690", time: "21:30" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "올리브영 배송 기다리면서 샤넬 뷰티 파우치 정리함", category: "일상샤반사", type: "daily-ad", accountId: "4giccokx", time: "21:50" },

  // === 건강한노후준비 (6건: ad6) ===
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "몸을 따뜻하게 하는 음식", category: "건강상식", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "16:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 오한", category: "건강정보", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "17:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "피로회복 음식", category: "자유게시판", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "18:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 효능", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "20:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "수족냉증 원인 치료", category: "질문게시판", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "21:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "국내산토종흑염소진액", category: "한약재정보", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "22:00" },

  // === 건강관리소 (6건: ad6) ===
  { cafe: "건강관리소", cafeId: "25227349", keyword: "영양제 복용시간", category: "건강이야기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "17:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "커피 대신 녹차", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "18:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "고단백 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "19:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후 영양제", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "20:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소 복용법", category: "건강이야기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "21:40" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "자궁에 좋은 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "22:50" },
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

// 스크립트 시작 시점 고정 (순차 처리 중 시간 밀림 방지)
const SCRIPT_START = Date.now();

const getDelayMs = (timeStr: string): number => {
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date(SCRIPT_START);
  target.setHours(h, m, 0, 0);

  // 예약 시간이 스크립트 시작 시점보다 이전이면 즉시 실행 (0)
  if (target.getTime() <= SCRIPT_START) {
    return 0;
  }

  return target.getTime() - SCRIPT_START;
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

    const typeLabels: Record<string, string> = { ad: "광고", daily: "일상", "daily-ad": "일상광고" };
    const typeLabel = typeLabels[item.type] || item.type;
    process.stdout.write(
      `[${item.time}] ${item.cafe} ${item.accountId} ${typeLabel} "${item.keyword}" ... `,
    );

    try {
      const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
      const isDailyContent = item.type === "daily" || item.type === "daily-ad";
      const kwType = item.keywordType || "own";
      const buildAdPrompt = kwType === "competitor"
        ? () => buildCompetitorKeywordPrompt({ keyword: item.keyword, keywordType: "competitor" })
        : contentStyle !== '정보'
          ? () => buildViralPrompt({ keyword: item.keyword, keywordType: "own" }, contentStyle)
          : () => buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" });
      const prompt = isDailyContent
        ? buildShortDailyPrompt({ keyword: item.keyword, keywordType: "own" })
        : buildAdPrompt();

      const { content } = await generateViralContent({
        prompt,
        // model은 text-gen-hub의 cafe_total_service DEFAULT_MODEL 사용
      });
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);
      if (!title || !body) throw new Error(`파싱 실패`);

      // daily-ad: 댓글 차단 + 바이럴 댓글 없음 (나중에 광고로 수정 후 댓글 달 예정)
      const isDailyAd = item.type === "daily-ad";
      const viralComments: ViralCommentsData | undefined =
        isDailyAd ? undefined
        : parsed?.comments?.length
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
        postType: item.type,
        commenterAccountIds: commenterIds,
        ...(isDailyAd && {
          skipComments: true,
          postOptions: {
            allowComment: false,
            allowScrap: true,
            allowCopy: false,
            useAutoSource: false,
            useCcl: false,
            cclCommercial: "disallow" as const,
            cclModify: "disallow" as const,
          },
        }),
        ...(!isDailyAd && { viralComments }),
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
