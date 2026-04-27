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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이경제흑염소120포", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "15:42" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25백 미니 블랙 캐비어 월요일에도 대기 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "15:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "친구 출산선물", category: "질문게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "15:58" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "40대 여자 선물", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "16:06" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올영데이 마지막 날 쿠폰 쓰려고 장바구니 다시 봤어요", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "16:14" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 레이디 디올 미니 라떼 컬러 착샷 저장해둠", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "16:22" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "시아버지생신선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "16:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "유산 후 몸조리 음식", category: "건강정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "16:38" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 선물", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "16:46" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신 준비 엽산", category: "건강정보", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "16:54" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "보테가 안디아모 스몰 폰덴테 월요일 매물 다시 봄", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "17:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소보감탕", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "17:10" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "수족냉증", category: "건강이야기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "17:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신준비 한약", category: "한약재정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "17:26" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "루이비통 알마 BB 모노그램 퇴근길 코디 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "17:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "초록마을 흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "17:42" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "유미의 세포들 시즌3 보다가 샤넬 클래식 미듐 착샷 검색했어요", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "17:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "몸을 따뜻하게 하는 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "17:58" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난임 한약 비용", category: "한약재정보", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "18:06" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "보양식 추천", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "18:14" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓프레시 과일컵 월요일 간식으로 담아봄", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "18:22" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "셀린느 트리오페 틴 탄 컬러 퇴근 후에도 눈에 밟힘", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "18:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "착상에 좋은 차", category: "건강정보", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "18:38" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소진액 먹는법", category: "건강이야기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "18:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "50대아빠생일선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "18:54" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "프라다 리나일론 호보백 월요일 출근룩 저장", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "19:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "본정심흑염소 효능", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "19:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후풍 원인", category: "건강상식", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "19:18" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 병원", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "19:26" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "가임력 검사", category: "건강상식", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "19:34" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 북토트 미디엄 오블리크 월요일 밤 매물 확인", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "19:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "유미의 세포들 시즌3 틀어놓고 저녁 간식 고민", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "19:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "폐경후 생리", category: "건강상식", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "19:58" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "계류유산 원인", category: "건강상식", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "20:06" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 가든파티 36 에토프 착샷 찾아봄", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "20:14" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타벅스 슈크림 라떼 쿠폰 월요일 저녁에 쓸까 고민", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "20:22" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 코코핸들 스몰 블랙 캐비어 월요일에도 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "20:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산후 한약", category: "건강이야기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "20:38" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "남자 임신 준비", category: "건강정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "20:46" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "아이 면역력 영양제", category: "건강이야기", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "20:54" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김소형원방 흑염소즙", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "21:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "웰스앤헬스 흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "21:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "활성형 엽산", category: "건강정보", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "21:18" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소 먹는 시간", category: "건강이야기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "21:26" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "정관장 활기력", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "21:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "수족냉증 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "21:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 봄 정리함 사러 퇴근길 들를까 봐요", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "21:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난자채취 후 음식", category: "건강정보", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "21:56" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신준비검사", category: "건강상식", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "21:59" },
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
