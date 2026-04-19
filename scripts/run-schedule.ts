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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "친구 출산선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "olgdmp9921", time: "12:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기치료제", category: "건강정보", type: "ad", keywordType: "competitor", accountId: "8i2vlbym", time: "12:12" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 26크루즈 컬렉션 입생로랑 비교 후기", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "12:24" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "아침 공복에 레몬물 마시기 3주째 변화", category: "자유로운이야기", type: "daily", accountId: "heavyzebra240", time: "12:36" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 효과", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "12:48" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "점심에 삼계탕 먹었는데 요즘 몸 기력이 좀 떨어짐", category: "자유게시판", type: "daily", accountId: "njmzdksm", time: "13:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "점심시간에 명품 리셀 가격 구경하다가 멘붕", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "13:12" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "점심 후 15분 걷기 운동 혈당 관리 효과", category: "건강 챌린지", type: "daily", accountId: "e6yb5u4k", time: "13:24" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 세일 장바구니 정리하다가 3만원 넘김", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "13:36" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "오후마다 졸려서 비타민B 먹기 시작했어요", category: "건강상식", type: "daily", accountId: "suc4dce7", time: "13:48" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "오후 졸릴때 다이소 꿀템 쇼핑 리스트 정리", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "14:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "수족냉증 차", category: "건강이야기", type: "ad", keywordType: "competitor", accountId: "xzjmfn3f", time: "14:12" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아기엄마 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "yenalk", time: "14:24" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산책하다가 약국에서 오메가3 상담 받음", category: "건강정보", type: "daily", accountId: "8ua1womn", time: "14:36" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "신이랑 법률사무소 이솜 샤넬 트위드자켓 협찬인가", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "14:48" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "하루견과 CJ너트리 간식으로 바꿨더니 좋음", category: "건강 관리 후기", type: "daily", accountId: "0ehz3cb2", time: "15:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소 먹는법", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "15:12" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "종근당 락토핏 유산균 2달째 후기", category: "건강정보", type: "daily", accountId: "umhu0m83", time: "15:24" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "편의점 신상 아이스크림 리뷰 하겐다즈 딸기", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "15:36" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "애플워치 심박수 알림 받고 건강검진 예약함", category: "건강이야기", type: "daily", accountId: "br5rbg", time: "15:48" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "갱년기 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "olgdmp9921", time: "16:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소보감탕", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "16:12" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "퇴근 전 카카오톡 선물하기 뭐 보낼지 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "16:24" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소 당뇨 추천", category: "건강이야기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "16:36" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "90대 할머니 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "eytkgy5500", time: "16:48" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "퇴근하고 필라테스 3개월차 허리통증 개선", category: "오늘의 운동", type: "daily", accountId: "8i2vlbym", time: "17:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "갤러리아 백화점 샤넬 매장 웨이팅 얼마나 걸려요", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "17:12" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "퇴근길 한의원 들러서 침 맞고 왔어요", category: "자유게시판", type: "daily", accountId: "heavyzebra240", time: "17:24" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소즙 추천", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "17:36" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "저녁 반찬 깻잎 들깨탕 끓이는 중 면역력 음식", category: "자유로운이야기", type: "daily", accountId: "njmzdksm", time: "17:48" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 클래식 미디엄 가격 또 올랐다길래 확인", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "18:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "저녁 메뉴 고민 중 건강식단 레시피 검색", category: "건강정보", type: "daily", accountId: "e6yb5u4k", time: "18:12" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송으로 다이슨 에어랩 지름신 강림", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "18:24" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "요즘 닥터지 선크림 바르고 비타민D 따로 챙김", category: "건강 관리 후기", type: "daily", accountId: "suc4dce7", time: "18:36" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "무신사 여름세일 시작해서 반팔 5장 질렀어요", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "18:48" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "사랑을 처방해 드립니다 보면서 건강 체크리스트 정리", category: "자유게시판", type: "daily", accountId: "xzjmfn3f", time: "19:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "60대 엄마 생신선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "uqgidh2690", time: "19:12" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "신이랑 법률사무소 보면서 스트레칭 하는 중", category: "취미이야기", type: "daily", accountId: "8ua1womn", time: "19:24" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "대군부인 아이유 샤넬 이어링 어디꺼인지 아시는분", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "19:36" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "잠들기 전 마그네슘 먹으니까 숙면 효과", category: "건강상식", type: "daily", accountId: "0ehz3cb2", time: "19:48" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "21세기 대군부인 아이유 패션 따라하기 코디 고민", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "20:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "수면 앱 필로우 써봤는데 수면 패턴 분석 신기", category: "건강이야기", type: "daily", accountId: "umhu0m83", time: "20:12" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "70대 할머니 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "yenalk", time: "20:24" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "보양식 추천", category: "건강상식", type: "ad", keywordType: "competitor", accountId: "br5rbg", time: "20:36" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클라이맥스 드라마 보면서 온라인 쇼핑 카트 정리", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "20:48" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "여성 갱년기 영양제", category: "건강 관리 후기", type: "ad", keywordType: "competitor", accountId: "beautifulelephant274", time: "21:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "SSG닷컴 새벽배송 장보기 완료 내일 아침이 기대", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "21:12" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "오늘 만보기 8천보 달성 내일은 만보 도전", category: "자유게시판", type: "daily", accountId: "angrykoala270", time: "21:24" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "40대 여자 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "4giccokx", time: "21:36" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "관절엔 콘드로이친1200", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "15:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "팔레오 고단백 프로틴", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "15:24" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비너지 대마종자유", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "15:48" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "카무트 영양견과바", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "16:12" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "미녀의 석류 콜라겐", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "16:36" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "정관장 홍삼활력플러스업", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "17:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "구수한맛 밸런스업", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "17:24" },
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
