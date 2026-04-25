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
import { buildCompetitorAdvocacyPrompt } from "../src/features/viral/prompts/build-competitor-advocacy-prompt";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type {
  PostJobData,
  ViralCommentsData,
} from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const SCHEDULE_START_TIME = process.env.SCHEDULE_START_TIME || "";
const SCHEDULE_END_TIME = process.env.SCHEDULE_END_TIME || "";

const getLocalDateToken = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${date}`;
};

const CAMPAIGN_TOKEN =
  process.env.SCHEDULE_RESCHEDULE_TOKEN || `campaign_${getLocalDateToken()}`;

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  keyword: string;
  category: string;
  type: "ad" | "daily" | "daily-ad";
  keywordType?: "own" | "competitor" | "competitor-advocacy";
  accountId: string;
  time: string; // "HH:MM"
}

const SCHEDULE: ScheduleItem[] = [
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아내 출산선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "11:35" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25백 미니 블랙 캐비어 대기 걸어둘지 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "11:48" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "친구 출산선물", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "12:01" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "보양식 추천", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "12:14" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 장바구니 토요일 점심에 정리했어요", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "12:27" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소보감탕", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "12:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "프라다 리에디션 2005 나일론백 주말 코디 고민", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "12:53" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 추위", category: "건강이야기", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "13:06" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "70대 할머니 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "13:19" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 병원", category: "건강상식", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "13:32" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "미우미우 완더 마테라쎄 호보백 매물 또 봤어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "13:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후 붓기차", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "13:58" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "몸을 따뜻하게 하는 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "14:11" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신 준비 비타민c", category: "건강정보", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "14:24" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 레이디 디올 미니 까나쥬 실물 보고 온 토요일", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "14:37" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신 전 건강 검진", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "14:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "GS25 김혜자 도시락 주말 점심으로 사왔어요", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "15:03" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "보건소 임신사전검사", category: "질문게시판", type: "ad", keywordType: "own", accountId: "br5rbg", time: "15:16" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "보테가 안디아모 스몰 폰덴테 컬러 고민 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "15:29" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "이노시톨 추천", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "15:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 세일 장바구니 또 늘어난 토요일", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "15:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후풍 증상 후유증", category: "건강상식", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "16:08" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 먹는법", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "16:21" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산 후 종합영양제", category: "건강이야기", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "16:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "16:47" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 먹는 시간", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "17:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 피코탄 18 에토프 매물 계속 보는 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "17:13" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "손이 차가운 이유", category: "건강이야기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "17:26" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "루이비통 네버풀 BB 모노그램 주말 매장 후기", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "17:39" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어린이 종합영양제", category: "건강정보", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "17:52" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "셀린느 트리오페 틴 탄 컬러 실물 궁금해요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "18:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "오쏘몰 이뮨", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "18:18" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타벅스 신메뉴 쿠폰 쓰러 나가는 토요일 저녁", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "18:31" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난임지원금 신청", category: "질문게시판", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "18:44" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아이 면역력 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "18:57" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "골다공증 주사 효과", category: "건강이야기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "19:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "산후 음식 기력 회복", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "19:23" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후보약 가격", category: "한약재정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "19:36" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "발렌시아가 르시티 미니백 토요일 착샷 찾아봄", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "19:49" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "착상에 좋은 영양제", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "20:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "수족냉증 차", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "20:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "만성피로 원인", category: "건강상식", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "20:28" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "생로랑 르 5 아 7 스몰 매장 들렀다 옴", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "20:41" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "성인 백일해 증상", category: "건강이야기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "20:54" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 호르몬치료", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "21:07" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신에 좋은 차", category: "건강정보", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "21:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 효과", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "21:33" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "편도염에 좋은 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "21:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "SSG 쓱배송 내일 장보기 미리 담아두는 밤", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "21:59" },
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
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  if (target.getTime() <= now.getTime()) {
    return 0;
  }

  return target.getTime() - now.getTime();
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

  const filteredSchedule = SCHEDULE.filter((item) => {
    const isAfterStart = !SCHEDULE_START_TIME || item.time >= SCHEDULE_START_TIME;
    const isBeforeEnd = !SCHEDULE_END_TIME || item.time <= SCHEDULE_END_TIME;
    return isAfterStart && isBeforeEnd;
  });

  console.log(`=== 스케줄 큐 추가 ===`);
  console.log(
    `user: ${LOGIN_ID} / writers: ${filteredSchedule.length}건 / commenters: ${commenterIds.length}명 / startFilter: ${SCHEDULE_START_TIME || "-"} / endFilter: ${SCHEDULE_END_TIME || "-"}\n`,
  );

  let totalPosts = 0;
  let failCount = 0;
  const totalSideComments = 0;
  const totalSideLikes = 0;

  const sortedSchedule = [...filteredSchedule].sort((a, b) =>
    a.time.localeCompare(b.time),
  );

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
      const buildAdPrompt = kwType === "competitor-advocacy"
        ? () => buildCompetitorAdvocacyPrompt({ keyword: item.keyword, keywordType: "competitor" })
        : kwType === "competitor"
          ? () => buildCompetitorKeywordPrompt({ keyword: item.keyword, keywordType: "competitor" })
          : contentStyle !== '정보'
            ? () => buildViralPrompt({ keyword: item.keyword, keywordType: "own" }, contentStyle)
            : () => buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" });
      const prompt = isDailyContent
        ? buildShortDailyPrompt({ keyword: item.keyword, keywordType: "own" })
        : buildAdPrompt();

      const { content } = await generateViralContent({
        prompt,
        model: "claude-sonnet-4-6",
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
        rescheduleToken: CAMPAIGN_TOKEN,
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
