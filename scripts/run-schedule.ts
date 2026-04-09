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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "닥터린 하이퍼셀 대마종자유", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "13:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "수원 난임병원", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "13:12" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25 사진 계속 넘겨보다가 점심시간 순삭", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "13:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산 후 몸조리", category: "취미이야기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "13:37" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비에날씬 프로 패밀리세트", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "13:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 효능", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "14:02" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 22 매장 사진 보다가 오후 코디 고민", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "14:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "난임지원비", category: "건강이야기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "14:27" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 BRING GREEN 티트리 시카 수딩 토너 세일 페이지만 계속 보는 중", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "14:40" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후조리 한약", category: "한약재정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "14:52" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12랑 CHANEL 22 중 데일리 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "15:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산전검사 비용", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "15:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "대원제약 혈당파이터", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "15:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난임검사 지원", category: "건강상식", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "15:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 월간남친 공개 소식 보고 커피 리필함", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "15:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산 후 한약", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "16:07" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "카무트 브랜드밀 견과바", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "16:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "시험관 동결 이식 비용", category: "건강정보", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "16:32" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "봄여름 2026 프리컬렉션 쇼핑백 컬러 비교 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "16:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "국내산토종흑염소진액", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "16:57" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 이 사랑 통역 되나요 라인업 다시 보는 중", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "17:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "42세 임신 가능성", category: "질문게시판", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "17:22" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 31 Mini Shopping Bag 실물 후기 계속 찾는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "17:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "기력회복 한약", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "17:47" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "프리미엄 윤방부박사의 넘버원 알부민", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "18:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어머니 환갑 선물", category: "자유게시판", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "18:12" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "봄여름 2026 프리컬렉션 밝은 트위드 체크가 계속 생각남", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "18:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "자궁 따뜻하게", category: "취미이야기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "18:37" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "담백한 베지밀A 검은콩두유", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "18:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산전검사 남자", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "19:02" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12 체인 길이 후기만 계속 읽는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "19:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "자연임신 확률", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "19:27" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 BRING GREEN 티트리 시카 토너 장바구니 정리 중", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "19:40" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신준비 홍삼", category: "한약재정보", type: "ad", keywordType: "own", accountId: "br5rbg", time: "19:52" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 31 Mini Shopping Bag 실루엣이 자꾸 눈에 밟힘", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "20:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후 영양제", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "20:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비에날 씬 프로", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "20:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신 준비기간", category: "건강상식", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "20:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "한미사이언스 완 전두유", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "20:55" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신준비 종합영양제", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "21:07" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "60대 엄마 생일선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "21:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난임검사 시점", category: "건강정보", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "21:32" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 산모 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "21:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소 살찌는지", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "21:57" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25랑 2.55 중 뭐부터 볼지 아직도 못 정함", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "22:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "착상에 좋은 음식", category: "질문게시판", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "22:22" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 원더풀스 얘기 보다 보니 야식 고민됨", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "22:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후도우미 기간", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "22:47" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "잠들기 전에 CHANEL 31 Mini Shopping Bag 후기만 또 보는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "23:00" },
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
