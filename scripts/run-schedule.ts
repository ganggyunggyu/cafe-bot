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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비에날씬", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "17:56" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이경제 흑염소 스틱", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "18:21" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 닥터지 레드 블레미쉬 수딩 크림 기획 다시 보게 되는 저녁", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "18:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 이 사랑 통역 되나요 켜두고 야식 메뉴만 늦게 고름", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "19:12" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "콘드로이친 MBP", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "19:37" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 폭싹 속았수다 얘기하다가 과자 봉지만 하나 더 뜯음", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "20:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 약한영웅 다시 보기 시작하니 커피가 식는 줄도 몰랐음", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "20:28" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "리포좀 글루타치온", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "20:53" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김소형원방 흑염소진액", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "21:18" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 닥터지 수딩 크림 오늘드림 페이지 괜히 또 열어봄", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "21:44" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "종근당 주니어홍삼", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "22:09" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "80대 할머니 생신선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "22:22" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "BNR17 유산균", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "22:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 산모 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "22:47" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "매스틱 유산균", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "23:00" },

  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25 사진 넘기다 보니 퇴근 준비가 자꾸 밀림", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "18:08" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Small Bowling Bag 컬러 보다가 저녁 약속 가방 다시 고민됨", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "18:34" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12 체인 길이 후기만 계속 읽는 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "18:59" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 31 Mini Shopping Bag 후기 캡처만 늘어남", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "19:24" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Spring Summer 2026 Pre-Collection 트위드 컬러가 계속 눈에 남음", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "19:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 22 매장 사진 보다가 데일리 코디 다시 상상함", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "20:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Maxi Hobo Bag 실루엣은 왜 밤에 더 생각나는지 모르겠음", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "20:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "2.55랑 CHANEL 22 중 뭐부터 볼지 아직도 못 정함", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "21:06" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Spring Summer 2026 쇼핑백 컬러 비교하다 또 시간 순삭", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "21:31" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12 블랙은 왜 밤마다 다시 보게 되는지 모르겠음", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "21:56" },

  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "삼성 헬스 수면 점수 보고 커피 한 잔 줄여볼까 고민 중", category: "자유게시판", type: "daily", accountId: "8i2vlbym", time: "18:02" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "40대 중반 임신 확률", category: "건강상식", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "18:27" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "오므론 혈압계 숫자 적다 보니 저녁 루틴이 생김", category: "한약재정보", type: "daily", accountId: "njmzdksm", time: "18:53" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "착상 음식", category: "한약재정보", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "19:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "다이슨 공기청정기 필터 갈고 나니 창문 여닫는 타이밍이 달라짐", category: "건강정보", type: "daily", accountId: "xzjmfn3f", time: "19:43" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "e보건소 난소검사 결과", category: "건강정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "20:09" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "스타벅스 디카페인 라떼로 바꾸니 밤이 조금 가벼운 느낌", category: "자유게시판", type: "daily", accountId: "0ehz3cb2", time: "20:34" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자라탕 효능", category: "질문게시판", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "20:59" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "마보 10분 명상 켜두니 퇴근 뒤 집중이 덜 무너짐", category: "한약재정보", type: "daily", accountId: "br5rbg", time: "21:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "태반주사 효과", category: "자유게시판", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "21:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "필로우 낮잠 알람 맞춰두고 오후 컨디션 챙기는 중", category: "건강정보", type: "daily", accountId: "angrykoala270", time: "22:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "광명 난임병원", category: "질문게시판", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "22:41" },

  { cafe: "건강관리소", cafeId: "25227349", keyword: "나이키 런클럽 켜고 걷기 페이스 보는 재미가 다시 붙음", category: "자유로운이야기", type: "daily", accountId: "0ehz3cb2", time: "18:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "후비루치료", category: "건강이야기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "18:40" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "삼성 헬스 만보기 채우려고 저녁 산책 한 바퀴 더 함", category: "건강이야기", type: "daily", accountId: "br5rbg", time: "19:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "독감에 좋은 음식", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "19:31" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "닥터유 프로틴바 하나 챙겨두니 군것질 타이밍이 줄어듦", category: "건강 관리 후기", type: "daily", accountId: "angrykoala270", time: "19:56" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "제왕절개 입원기간", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "20:21" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "쿠팡 로켓프레시 샐러드 꺼내 놓으니 야식 욕심이 덜함", category: "취미이야기", type: "daily", accountId: "8i2vlbym", time: "20:47" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "맘모톰수술비용", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "21:12" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "듀오링고 불꽃 이어가려고 밤 산책까지 하고 들어옴", category: "건강 관리 후기", type: "daily", accountId: "njmzdksm", time: "21:37" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유방 조직검사", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "22:03" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유튜브 핏블리 스트레칭 따라 하고 나니 어깨가 덜 굳는 느낌", category: "오늘의 운동", type: "daily", accountId: "xzjmfn3f", time: "22:28" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산 후 러닝", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "22:53" },
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
        model: "gemini-3.1-pro-preview",
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
