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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어버이날 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "10:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 레이디 디올 미디엄 까만색 또 매장 갔어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "11:03" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어버이날 선물", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "11:16" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "어버이날 선물", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "11:29" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비비고 비빔만두 신상 저녁으로 시켜본 후기", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "11:42" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "청소년 종합영양제", category: "건강정보", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "11:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "보테가 카세트 인트레치아토 카멜 사기 직전 마지막 고민", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "12:08" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "기력보충 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "12:21" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "60대 엄마 생일선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "12:34" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어린이 면역력 영양제", category: "건강정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "12:47" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "셀린느 트리오페 미디움 빈티지 시세 확인 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "13:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "영양제 복용시간", category: "건강이야기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "13:13" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "보양음식", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "13:26" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자라탕 효능", category: "한약재정보", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "13:39" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 가든파티 36 깐돌 또 돌아왔어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "13:52" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후조리원", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "14:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "CU 오리지널 깐풍기 도시락 퇴근길에 사봤어요", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "14:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 치료 약", category: "건강상식", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "14:31" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "미우미우 마테라쎄 나노 매물 보다가 또 자극받음", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "14:44" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "노산 나이", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "14:57" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "알리 브랜드 특가전 카트 비우고 다시 채우는 중", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "15:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신준비영양제", category: "건강정보", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "15:23" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갈근탕 효능", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "15:36" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "손발차가움", category: "건강이야기", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "15:49" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "16:02" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "면역력 좋아지는 음식", category: "건강상식", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "16:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "루이비통 알마 BB 모노그램 매장에서 못 잊어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "16:28" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "락토핏 맘스", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "16:41" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "프라다 갈러리아 미니 사피아노 4월 가격 또 올랐어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "16:54" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어버이날 부모님선물", category: "자유게시판", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "17:07" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "발렌시아가 아워글라스 XS 매물 다시 확인하는 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "17:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "어버이날 부모님선물", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "17:33" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "신이랑 법률사무소 보다가 야식 시킨 화요일 밤", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "17:46" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "후비루치료", category: "질문게시판", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "17:59" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 북 토트 미디움 영상 돌려보다가 새벽 됐어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "18:12" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "홍삼스틱", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "18:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어버이날 부모님선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "18:38" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "폐경 호르몬치료", category: "건강상식", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "18:51" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타벅스 5월 다이어리 사전 예약 알람 맞춰놨어요", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "19:04" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갈근탕", category: "건강이야기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "19:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신준비 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "19:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "종근당 주니어홍삼", category: "건강정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "19:43" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 19백 미디움 인스타 보다가 자극받은 화요일 밤", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "19:56" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 오한", category: "건강이야기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "20:09" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "수족냉증", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "20:22" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산전검사 비용", category: "질문게시판", type: "ad", keywordType: "own", accountId: "br5rbg", time: "20:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "자궁에 좋은 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "20:48" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "폐경", category: "건강이야기", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "21:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산 후 몸조리", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "21:14" },
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
