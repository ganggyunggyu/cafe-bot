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
const SCHEDULE_MODEL = process.env.SCHEDULE_MODEL || "deepseek-v4-flash";

const getLocalDateToken = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${date}`;
};

const CAMPAIGN_TOKEN =
  process.env.SCHEDULE_RESCHEDULE_TOKEN || `campaign_${getLocalDateToken()}`;

const GLOBAL_BLOCKED_COMMENTER_ACCOUNT_IDS = new Set([
  "pixelninja3",
  "ahffkekd12",
  "dhtksk1p",
]);

const BLOCKED_COMMENTER_ACCOUNT_IDS_BY_CAFE_ID: Record<string, Set<string>> = {
  "25729954": new Set(),
};

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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김오곤흑염소진액", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "22:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 새들백 미디엄 베이지 화요일 밤 위시리스트", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "22:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "두레생협흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "22:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올영데이 쿠폰 새벽 장바구니 정리하다 5만원 넘김", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "22:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "폭싹 속았수다 다시보기 보면서 샤넬 클래식 미듐 카프 검색", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "22:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신준비 종합영양제", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "22:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 산부인과 치료", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "22:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "모유수유 흑염소", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "22:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "영양제 복용시간", category: "건강이야기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "22:40" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 효능", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "22:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산모 음식", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "22:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "루이비통 카퓌신 BB 갈레 화요일 새벽 매물 확인", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "22:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "천호 흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "23:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "환승연애4 보면서 샤넬 코코핸들 미니 위시리스트", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "23:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "매포흑염소진액", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "23:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 가격 비교", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "23:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "출산후 한약 산후 회복", category: "한약재정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "23:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "호르몬주사 부작용", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "23:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신 잘되는 한약", category: "한약재정보", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "23:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "폐경 초기증상", category: "건강이야기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "23:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "노산 검사 항목", category: "건강상식", type: "ad", keywordType: "own", accountId: "br5rbg", time: "23:40" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후도우미 정부지원금", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "23:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "한살림흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "23:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "굿파트너 다시보기 보다가 샤넬 트위드 자켓 검색", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "23:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "코스트코 곰표 오징어튀김 새벽 재입고 알림 기다림", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "00:00" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 가든파티 36 골드 새벽 매장 가격 비교", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "00:05" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "셀린느 클래식 미디엄 탠 새벽 매물 체크", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "00:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자궁 따뜻하게", category: "건강정보", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "00:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "어린이 종합영양제", category: "건강이야기", type: "ad", keywordType: "own", accountId: "regular14631", time: "00:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임산부 흑염소", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "00:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "면역력 좋아지는 음식", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "00:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임신준비 영양제", category: "건강정보", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "00:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 흑염소", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "00:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "흑백요리사 다시보기 보면서 샤넬 가브리엘 호보 인스타 검색", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "00:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "천담온흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "00:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 추천", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "00:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "정년이 다시보기 보면서 샤넬 보이백 코디 저장", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "01:00" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "스타벅스 슈크림 라떼 화요일 저녁 쿠폰 고민", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "01:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "시험관 동결 이식 비용", category: "질문게시판", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "01:10" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신 좋은 음식", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "01:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "동결배아 이식 전 식단", category: "건강정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "01:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 추위", category: "건강이야기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "01:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후풍 한약", category: "한약재정보", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "01:30" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "50살 임신", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "01:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 봄 정리함 화요일 밤 품절 확인", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "01:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓프레시 곰곰 방울토마토 새벽 장바구니 정리", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "01:45" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "보테가 안디아모 미디엄 폰덴테 새벽 위시리스트", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "01:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "풍산원 흑염소 진액", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "01:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소 함량 높은 제품", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "02:00" },
];


const getEligibleCommenterIds = (
  commenterIds: string[],
  cafeId: string,
): string[] => {
  const cafeBlockedIds = BLOCKED_COMMENTER_ACCOUNT_IDS_BY_CAFE_ID[cafeId];

  return commenterIds.filter(
    (accountId) =>
      !GLOBAL_BLOCKED_COMMENTER_ACCOUNT_IDS.has(accountId) &&
      !cafeBlockedIds?.has(accountId),
  );
};

const createWriterResolver = (writerAccountIds: string[]) => {
  const cursorByCafeId = new Map<string, number>();
  const writerAccountIdSet = new Set(writerAccountIds);

  return ({ accountId, cafeId }: ScheduleItem): string => {
    if (writerAccountIdSet.has(accountId)) {
      return accountId;
    }

    const cursor = cursorByCafeId.get(cafeId) ?? 0;
    const writerAccountId = writerAccountIds[cursor % writerAccountIds.length];
    cursorByCafeId.set(cafeId, cursor + 1);
    return writerAccountId;
  };
};

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

  if (target.getTime() <= now.getTime() && h < 6) {
    target.setDate(target.getDate() + 1);
  }

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
  const writerAccountIds = accounts
    .filter((a) => a.role === "writer")
    .map((a) => a.accountId);
  const commenterIds = accounts
    .filter((a) => a.role === "commenter")
    .map((a) => a.accountId);

  if (writerAccountIds.length === 0) throw new Error("writer 계정 없음");

  const activeSchedule = SCHEDULE;
  const filteredSchedule = activeSchedule.filter((item) => {
    const isAfterStart = !SCHEDULE_START_TIME || item.time >= SCHEDULE_START_TIME;
    const isBeforeEnd = !SCHEDULE_END_TIME || item.time <= SCHEDULE_END_TIME;
    return isAfterStart && isBeforeEnd;
  });

  console.log(`=== 스케줄 큐 추가 ===`);
  console.log(
    `user: ${LOGIN_ID} / jobs: ${filteredSchedule.length}건 / writers: ${writerAccountIds.length}명 / commenters: ${commenterIds.length}명 / startFilter: ${SCHEDULE_START_TIME || "-"} / endFilter: ${SCHEDULE_END_TIME || "-"}`,
  );
  console.log(`writer accounts: ${writerAccountIds.join(", ")}`);
  console.log(
    `commenter blocked: global=${Array.from(GLOBAL_BLOCKED_COMMENTER_ACCOUNT_IDS).join(", ")} / shopping=${Array.from(BLOCKED_COMMENTER_ACCOUNT_IDS_BY_CAFE_ID["25729954"]).join(", ")}\n`,
  );

  let totalPosts = 0;
  let failCount = 0;
  const totalSideComments = 0;
  const totalSideLikes = 0;

  const sortedSchedule = [...filteredSchedule].sort((a, b) =>
    a.time.localeCompare(b.time),
  );
  const resolveWriterAccountId = createWriterResolver(writerAccountIds);
  const scheduledRows = sortedSchedule.map((item) => {
    const writerAccountId = resolveWriterAccountId(item);
    const eligibleCommenterIds = getEligibleCommenterIds(commenterIds, item.cafeId);

    return { item, writerAccountId, eligibleCommenterIds };
  });
  const remappedWriterCount = scheduledRows.filter(
    ({ item, writerAccountId }) => item.accountId !== writerAccountId,
  ).length;

  console.log(`writer remap: ${remappedWriterCount}건`);

  for (const { item, writerAccountId, eligibleCommenterIds } of scheduledRows) {
    const delayMs = getDelayMs(item.time);
    const cafe = cafeMap.get(item.cafeId);
    if (!cafe) {
      console.log(`❌ 카페 없음: ${item.cafeId}`);
      failCount++;
      continue;
    }

    const account = accountMap.get(writerAccountId);
    if (!account) {
      console.log(`❌ 계정 없음: ${writerAccountId}`);
      failCount++;
      continue;
    }

    const typeLabels: Record<string, string> = { ad: "광고", daily: "일상", "daily-ad": "일상광고" };
    const typeLabel = typeLabels[item.type] || item.type;
    const remapLabel = writerAccountId === item.accountId ? "" : ` (from ${item.accountId})`;
    process.stdout.write(
      `[${item.time}] ${item.cafe} ${writerAccountId}${remapLabel} ${typeLabel} "${item.keyword}" ... `,
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
        model: SCHEDULE_MODEL,
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
        accountId: writerAccountId,
        userId: user.userId,
        cafeId: item.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: body,
        rawContent: content,
        keyword: item.keyword,
        category: item.category,
        postType: item.type,
        commenterAccountIds: eligibleCommenterIds,
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

      await addTaskJob(writerAccountId, jobData, delayMs);
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
