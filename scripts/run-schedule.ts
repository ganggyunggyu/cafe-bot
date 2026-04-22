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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "80대 할머니 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "19:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 효능", category: "흑염소진액정보", type: "ad", keywordType: "competitor", accountId: "8i2vlbym", time: "20:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "아이소이 블레미쉬 케어 세럼 추천", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "20:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "40대 여성 영양제", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "orangeswan630", time: "20:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "고등학생 비타민", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "20:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신 한약", category: "한약재정보", type: "ad", keywordType: "competitor", accountId: "heavyzebra240", time: "20:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "신라면 툼바 끓이는데 포장지 디자인 너무 귀여움", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "20:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "피로회복 음식", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "angrykoala270", time: "20:30" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "이오페 더 샷 에센스 2개월 써본 후기", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "20:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자궁에 좋은 음식", category: "건강정보", type: "ad", keywordType: "competitor", accountId: "njmzdksm", time: "20:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소에서 헬로키티 미니 가습기 발견해서 바로 집어옴", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "20:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "키크는 영양제", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "8i2vlbym", time: "20:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "70대 할머니 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "20:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 복용법", category: "흑염소진액정보", type: "ad", keywordType: "competitor", accountId: "e6yb5u4k", time: "21:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "셀린느 트리옹프 카드홀더 블랙 1년 쓴 컨디션 공유", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "21:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "활성형 엽산", category: "건강 관리 후기", type: "ad", keywordType: "competitor", accountId: "heavyzebra240", time: "21:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "기력보충 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "21:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자라탕 효능", category: "한약재정보", type: "ad", keywordType: "competitor", accountId: "suc4dce7", time: "21:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "엄마 칠순 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "21:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "어린이 면역력 영양제", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "njmzdksm", time: "21:30" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "라로슈포제 시카 플라스트 B5 이거 리뉴얼", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "21:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "수족냉증 원인 치료", category: "건강상식", type: "ad", keywordType: "competitor", accountId: "xzjmfn3f", time: "21:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 4월 세일 라운드랩 어성초 토너 리뉴얼 질러봄", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "21:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "영양제 복용시간", category: "자유로운이야기", type: "ad", keywordType: "competitor", accountId: "e6yb5u4k", time: "21:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어머님 생신선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "21:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "토종흑염소진액 효능", category: "흑염소진액정보", type: "ad", keywordType: "competitor", accountId: "8ua1womn", time: "22:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 에블린 PM 25 TPM 크기 고민중", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "22:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "원기회복 음식", category: "자유로운이야기", type: "ad", keywordType: "competitor", accountId: "suc4dce7", time: "22:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "BTS 진 콘서트 사운드체크 영상 돌려보다가 눈물남", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "22:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "기력회복 한약", category: "한약재정보", type: "ad", keywordType: "competitor", accountId: "0ehz3cb2", time: "22:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이경제흑염소120포", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "22:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산 후 러닝", category: "오늘의 운동", type: "ad", keywordType: "competitor", accountId: "xzjmfn3f", time: "22:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "산모 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "22:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "후비루치료", category: "질문게시판", type: "ad", keywordType: "competitor", accountId: "beautifulelephant274", time: "22:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에스트라 아토베리어365 수분크림 가을 예비용", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "22:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유아 영양제", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "8ua1womn", time: "22:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "홍삼스틱", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "22:55" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "남자 흑염소 효능", category: "자유게시판", type: "ad", keywordType: "competitor", accountId: "tinyfish183", time: "23:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "정관장 활기력", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "23:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 치료 약", category: "건강 관리 후기", type: "ad", keywordType: "competitor", accountId: "0ehz3cb2", time: "23:10" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "로로피아나 캐시미어 스카프 퀸즈그린 지나가다 실물 보고 반함", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "23:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자궁 따뜻하게", category: "건강상식", type: "ad", keywordType: "competitor", accountId: "umhu0m83", time: "23:20" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "루이비통 네오노에 BB 오니아 바이에브 먼지 쌓이고 있어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "23:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "청소년 종합영양제", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "beautifulelephant274", time: "23:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "화요일 저녁 편의점에서 비비고 왕교자 3봉지 쓸어담음", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "23:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "독감에 좋은 음식", category: "건강정보", type: "ad", keywordType: "competitor", accountId: "br5rbg", time: "23:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "닥터자르트 시카페어 세럼 써보니까", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "23:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "종근당 주니어홍삼", category: "건강 관리 후기", type: "ad", keywordType: "competitor", accountId: "tinyfish183", time: "23:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 블랙홀 미니 플랩 리세일 시세 확인한 화요일", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "23:55" },
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
