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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "친구 출산선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "17:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신 전 건강 검진", category: "건강상식", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "17:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Small Bowling Bag 컬러 보다 보니 저녁 약속 가방 고민됐어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "17:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "나팔관조영술 실비", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "18:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아이들 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "18:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "오므론 혈압계 숫자 적다 보니 저녁 루틴이 생겼어요", category: "자유게시판", type: "daily", accountId: "heavyzebra240", time: "18:10" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Classic 11.12 체인 길이 비교하다 저녁 시간이 순삭됐어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "18:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "쿠팡 로켓프레시 샐러드 꺼내 놓으니 야식 욕심이 좀 줄었어요", category: "건강이야기", type: "daily", accountId: "0ehz3cb2", time: "18:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "오쏘몰 이뮨", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "18:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "다이슨 공기청정기 필터 갈고 나니 괜히 창문 여닫게 돼요", category: "건강정보", type: "daily", accountId: "njmzdksm", time: "18:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "나이키 런클럽 켜고 걷기 페이스 보는 재미가 생겼어요", category: "오늘의 운동", type: "daily", accountId: "umhu0m83", time: "18:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25 사진 넘기다가 퇴근 버스 놓칠 뻔했어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "18:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "삼성 헬스 만보기 채우려고 동네 한 바퀴 더 돌았어요", category: "건강정보", type: "daily", accountId: "e6yb5u4k", time: "18:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "18:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "닥터유 프로틴바 하나 챙겨두니 군것질 타이밍이 줄었어요", category: "건강 챌린지", type: "daily", accountId: "br5rbg", time: "19:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 브링그린 티트리 패드 세일 페이지 다시 열었어요", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "19:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 병원", category: "질문게시판", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "19:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산 후 종합영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "19:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후도우미 지원기간", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "19:20" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12 블랙은 왜 매번 다시 보게 되는지 모르겠어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "19:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "스타벅스 디카페인 라떼로 저녁 커피 욕심 눌렀어요", category: "자유게시판", type: "daily", accountId: "xzjmfn3f", time: "19:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유튜브 핏블리 스트레칭 따라 했더니 저녁이 덜 무거웠어요", category: "건강이야기", type: "daily", accountId: "angrykoala270", time: "19:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 블러드하운즈 틀어두고 간식 고르다 저녁이 늦어졌어요", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "19:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "애플워치 스탠드 링 닫으려고 설거지 끝나고 제자리걸음 했어요", category: "건강상식", type: "daily", accountId: "8ua1womn", time: "19:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Spring-Summer 2026 트위드 보고 봄옷 괜히 다시 찾았어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "19:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "카카오맵 산책 코스 저장해두고 동네 길 바꿔 걸었어요", category: "취미이야기", type: "daily", accountId: "tinyfish183", time: "20:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 31 Mini Shopping Bag 후기만 계속 읽고 있어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "20:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "필로우 낮잠 알람 맞춰두니 오후가 덜 무너졌어요", category: "건강정보", type: "daily", accountId: "0ehz3cb2", time: "20:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "EXO EXhOrizon 후기 영상 보다가 주말 약속부터 잡았어요", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "20:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "테팔 에어프라이어에 고구마 돌려두니 냉장고 덜 열게 돼요", category: "자유로운이야기", type: "daily", accountId: "orangeswan630", time: "20:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아기엄마 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "20:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "골다공증 주사 효과", category: "건강정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "20:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "제왕절개 회복기간", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "20:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Maxi Hobo Bag 실착 영상보다 위시만 늘었어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "20:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "오쏘몰 이뮨은 못 챙겨도 물병은 끝까지 비웠어요", category: "자유게시판", type: "daily", accountId: "br5rbg", time: "20:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이노시톨 추천", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "20:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "배달의민족 샐러드 검색하다 결국 집 반찬으로 버텼어요", category: "건강 챌린지", type: "daily", accountId: "heavyzebra240", time: "21:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신 준비 비타민c", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "21:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "듀오링고 불꽃 이어가려다 밤 산책까지 하고 들어왔어요", category: "건강상식", type: "daily", accountId: "beautifulelephant274", time: "21:10" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25 데님 버전 캡처만 잔뜩 저장했어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "21:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "삼성 헬스 수면 점수 낮게 떠서 오늘은 일찍 눕기로 했어요", category: "건강이야기", type: "daily", accountId: "njmzdksm", time: "21:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 장바구니에서 휴지랑 과자만 다시 정리했어요", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "21:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "유튜브 요가소년 스트레칭 따라 하니 어깨가 덜 굳는 느낌이에요", category: "건강정보", type: "daily", accountId: "angrykoala270", time: "21:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유튜브 말왕 홈트 보다가 매트부터 다시 펼쳤어요", category: "오늘의 운동", type: "daily", accountId: "e6yb5u4k", time: "21:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "60대 엄마 생신선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "21:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타벅스 디카페인 라떼 들고 퇴근길 한 바퀴 돌았어요", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "21:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "2.55랑 CHANEL 22 중 뭐가 먼저일지 아직도 못 정했어요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "22:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어린이 종합영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "22:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Spring-Summer 2026 Pre-Collection 컬러감이 계속 생각나요", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "22:25" },
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
  const totalSideComments = 0;
  const totalSideLikes = 0;

  const sortedSchedule = [...SCHEDULE].sort((a, b) =>
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
