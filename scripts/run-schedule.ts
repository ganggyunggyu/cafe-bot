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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "오한진의 백세알부민", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "15:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소진액 추천 50대", category: "자유게시판", type: "ad", keywordType: "competitor", accountId: "8i2vlbym", time: "15:38" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 새들백 미니 vs 미디움 사이즈 고민", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "15:46" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "등산 후 마시는 보양차", category: "취미이야기", type: "ad", keywordType: "competitor", accountId: "umhu0m83", time: "15:54" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "제주산 당찬여주 발효효소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "16:02" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "한방 보양식 종류", category: "자유게시판", type: "ad", keywordType: "competitor", accountId: "heavyzebra240", time: "16:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이어트 유산균 비에날씬", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "16:18" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "골프 라운딩 전 영양제", category: "취미이야기", type: "ad", keywordType: "competitor", accountId: "br5rbg", time: "16:26" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "프라다 갈레리아 미디움 사파노 가죽 데일리", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "16:34" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "침향환 효능 정리", category: "흑염소진액정보", type: "ad", keywordType: "competitor", accountId: "njmzdksm", time: "16:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "홍삼진고 데일리스틱", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "16:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "BNR17 유산균 효능", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "angrykoala270", time: "16:58" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "셀린느 트리옹프 프린트 캔버스 신상", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "17:06" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "공진단 효능 가격", category: "흑염소진액정보", type: "ad", keywordType: "competitor", accountId: "e6yb5u4k", time: "17:14" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "교촌치킨 허니콤보 시켰는데 양념이 더 맛있음", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "17:22" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "50대 여성 갱년기 영양제", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "orangeswan630", time: "17:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "베지밀", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "17:38" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "한약재 보관법", category: "한약재정보", type: "ad", keywordType: "competitor", accountId: "suc4dce7", time: "17:46" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25C 미니 클러치백 실물 후기", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "17:54" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "매일 비타민D 챙기기", category: "자유로운이야기", type: "ad", keywordType: "competitor", accountId: "8i2vlbym", time: "18:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "산모 흑염소진액 추천", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "18:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "사상체질 한약 추천", category: "한약재정보", type: "ad", keywordType: "competitor", accountId: "xzjmfn3f", time: "18:18" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 가든파티 36 스트라이프 매장 재고", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "18:26" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "사상체질별 식단 추천", category: "자유로운이야기", type: "ad", keywordType: "competitor", accountId: "heavyzebra240", time: "18:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "21세기 대군부인 보면서 라면 끓이는 월요일 밤", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "18:42" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "면역력 영양제 추천", category: "건강상식", type: "ad", keywordType: "competitor", accountId: "8ua1womn", time: "18:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "월간남친 보면서 떡볶이 시켜먹는 월요일 오후", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "18:58" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "30일 면역력 챌린지 후기", category: "건강 챌린지", type: "ad", keywordType: "competitor", accountId: "njmzdksm", time: "19:06" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "닥터지 레드블레미쉬 클리어 수딩 크림", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "19:14" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 영양제 비교", category: "건강상식", type: "ad", keywordType: "competitor", accountId: "0ehz3cb2", time: "19:22" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임산부 흑염소 진액 효능", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "19:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "한달 만보걷기 챌린지", category: "건강 챌린지", type: "ad", keywordType: "competitor", accountId: "e6yb5u4k", time: "19:38" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "멜릭서 비건 리페어 세럼", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "19:46" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "60대 건강관리 비법", category: "건강정보", type: "ad", keywordType: "competitor", accountId: "umhu0m83", time: "19:54" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기유산균YT1 메노락토 오리진", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "20:02" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소진액 3개월 후기", category: "건강 관리 후기", type: "ad", keywordType: "competitor", accountId: "suc4dce7", time: "20:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 효능 비교", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "20:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "폐경기 호르몬치료", category: "건강정보", type: "ad", keywordType: "competitor", accountId: "br5rbg", time: "20:26" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "헤라 블랙 쿠션 21호", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "20:34" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "콜라겐 비오틴 6개월 후기", category: "건강 관리 후기", type: "ad", keywordType: "competitor", accountId: "xzjmfn3f", time: "20:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 가격 비교", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "20:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갈근탕 효능 부작용", category: "질문게시판", type: "ad", keywordType: "competitor", accountId: "beautifulelephant274", time: "20:58" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "미니랩 시카 수분크림", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "21:06" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "아침 스트레칭 루틴 추천", category: "오늘의 운동", type: "ad", keywordType: "competitor", accountId: "8ua1womn", time: "21:14" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 다이슨 에어랩 장바구니에 또 담음", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "21:22" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "한약 먹는 시간", category: "질문게시판", type: "ad", keywordType: "competitor", accountId: "tinyfish183", time: "21:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 4월 세일 바디미스트 5개 질러버림", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "21:38" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "퇴근 후 필라테스 6개월차", category: "오늘의 운동", type: "ad", keywordType: "competitor", accountId: "0ehz3cb2", time: "21:46" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "라네즈 워터뱅크 블루 하이알루로닉 크림", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "21:54" },
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
