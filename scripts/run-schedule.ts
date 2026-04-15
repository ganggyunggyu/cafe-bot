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
  // === 건강한노후준비 (자사6 + 일상6) + 쇼핑/샤넬 오전 ===
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "모유수유흑염소", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "16:15" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "고려은단 비타민C 메가도스", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "16:22" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "삼성헬스 수면 점수 보고 카페인 줄여볼까 고민 중", category: "질문게시판", type: "daily", accountId: "njmzdksm", time: "16:29" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 26SS 크러시드 트위드 클러치 인스타 릴스 또 저장함", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "16:37" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "당뇨 흑염소", category: "한약재정보", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "16:44" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "뉴트리원 비타민D 4000IU", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "16:51" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "올리브영 비타민D 츄어블 하나씩 챙겨먹기 시작함", category: "건강상식", type: "daily", accountId: "umhu0m83", time: "16:58" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "함소아 종합비타민 키즈", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "17:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "홈쇼핑 흑염소", category: "건강정보", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "17:13" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "녹십자 오메가3 프리미엄", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "17:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "유미의 세포들3 보면서 건강차 한 잔 마시는 수요일 밤", category: "흑염소진액정보", type: "daily", accountId: "8ua1womn", time: "17:27" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소엑기스 복용법 효능", category: "자유게시판", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "17:34" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 코코 크러쉬 팔찌 봄 컬렉션 실물 보고 싶어 죽겠음", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "17:41" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "쿠팡 로켓프레시 현미밥 시켜 먹기 시작한 지 한 달째", category: "건강정보", type: "daily", accountId: "e6yb5u4k", time: "17:48" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 액기스 당뇨", category: "건강상식", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "17:56" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "스타벅스 디카페인 카페라떼로 바꾸니 밤에 좀 나은 느낌", category: "한약재정보", type: "daily", accountId: "0ehz3cb2", time: "18:03" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25백 가격 1000만원 넘었다는 기사 보고 한숨만 나옴", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "18:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소환", category: "질문게시판", type: "ad", keywordType: "own", accountId: "br5rbg", time: "18:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 산리오 시나모롤 봄 신상 텀블러 출근길에 득템", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "18:24" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 클래식 미니 캐비어 화이트 재입고 소식에 심장 뜀", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "18:32" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "봄맞이 공원 산책하면서 벚꽃 지는 거 보니 아쉬움", category: "흑염소진액정보", type: "daily", accountId: "angrykoala270", time: "18:39" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 31 미니 쇼핑백 신세계 본점 웨이팅 후기 읽는 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "18:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "CU 편의점 두바이 초콜릿 아이스크림 봄 신상 사 와서 리뷰", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "18:53" },

  // === 건강관리소 (자사6 + 일상6) + 쇼핑/샤넬 오후 ===
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "올리브영 메디힐 마스크팩 1+1 이벤트 장바구니에 10개째", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "19:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소고기 효능", category: "취미이야기", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "19:08" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "나이키 런클럽 5km 기록 조금씩 줄이는 재미", category: "오늘의 운동", type: "daily", accountId: "8i2vlbym", time: "19:15" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "셀렉스 코어프로틴 락토프리", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "19:22" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "남자 흑염소 효능", category: "건강이야기", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "19:29" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후좋은음식", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "19:36" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "오므론 혈압계 아침저녁 기록하는 게 습관됨", category: "건강 관리 후기", type: "daily", accountId: "8ua1womn", time: "19:43" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "폐경 호르몬치료", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "19:51" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "장모님선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "19:58" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "다이소 텀블러 사서 물 2리터 챌린지 도전 중", category: "건강 챌린지", type: "daily", accountId: "umhu0m83", time: "20:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "유미의 세포들3 김고은 봄 코디 보면서 옷장 정리 시작함", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "20:12" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "장어즙부작용", category: "취미이야기", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "20:19" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "21세기 대군부인 보면서 홈트 하겠다고 결심만 계속 함", category: "건강이야기", type: "daily", accountId: "xzjmfn3f", time: "20:27" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "난소나이검사 무료 지원", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "20:34" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "편의점 프로틴바 하나 사 먹는 게 요즘 간식 루틴", category: "자유로운이야기", type: "daily", accountId: "e6yb5u4k", time: "20:41" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "유미의 세포들3 김고은 세포들 귀여워서 카톡 이모티콘 검색 중", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "20:48" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신준비 대추차", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "20:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "스타벅스 봄 시즌 피치 프라푸치노 마시면서 퇴근길 산책", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "21:03" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유튜브 핏블리 어깨 스트레칭 따라하니 뻐근함이 좀 풀림", category: "건강 챌린지", type: "daily", accountId: "br5rbg", time: "21:10" },

  // === 쇼핑/샤넬 저녁 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 코멧 키친타올 대용량 세일이라 3개 질렀음", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "21:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "부모님생일선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "21:24" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "21세기 대군부인 변우석 갑옷씬 보다가 치킨 시켰음", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "21:31" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "21세기 대군부인 아이유 한복 비하인드 보다가 캡처만 30장", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "21:38" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "종근당건강 락토핏 골드", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "21:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "광동제약 경옥고", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "21:53" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "오늘도 매진했습니다 안효섭 예고편 보고 넷플릭스 찜 완료", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "22:00" },
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
