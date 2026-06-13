/**
 * 스케줄 큐 추가 스크립트
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-schedule.ts
 */

import mongoose from "mongoose";
import { readFileSync } from "fs";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildCompetitorKeywordPrompt } from "../src/features/viral/prompts/build-competitor-keyword-prompt";
import { buildCompetitorAdvocacyPrompt } from "../src/features/viral/prompts/build-competitor-advocacy-prompt";
import { buildHanryeoCafePrompt } from "../src/features/viral/prompts/build-hanryeo-cafe-prompt";
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
const SCHEDULE_FILE = process.env.SCHEDULE_FILE || "";
const SCHEDULE_AD_PROMPT_PROFILE = process.env.SCHEDULE_AD_PROMPT_PROFILE || "";

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
  "25729954": new Set(["dhtksk1p"]),
};

const HANRYEO_CAFE_IDS = new Set([
  "25636798", // 건강한노후준비
  "25227349", // 건강관리소
]);

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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소진액 성분", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "19:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25 미디엄 캐비어 블랙 골드 일요일 밤 매장 입고 알림 또 기다림", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "19:58" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 흑염소", category: "건강정보", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "20:06" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "모유수유흑염소", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "20:14" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "일요일 저녁 다이소 봄정리함 5만원어치 결제하고 정리하는 중", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "20:22" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "폭싹 속았수다 마지막회 보면서 샤넬 인스타 정주행 중인 일요일 밤", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "20:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "80대 할머니 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "20:38" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자라탕 효능", category: "건강상식", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "20:46" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임산부 잉어즙", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "20:54" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "디올 새들백 미디엄 오블리크 일요일 밤 위시리스트 정리 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "21:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "기력보충 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "21:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소 효능", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "21:18" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "김오곤 흑염소", category: "건강이야기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "21:26" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "일요일 저녁 BBQ 황금올리브 시켜놓고 샤넬 25 카탈로그 보는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "21:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 야식 곱창 5만원어치 카트에 담는 일요일 밤", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "21:42" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "보양음식", category: "건강정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "21:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신준비 한약", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "21:58" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "시험관 착상에 좋은 음식", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "22:06" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "에르메스 콘스탄스 24 골드 일요일 자정 매물 알림 기다리는 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "22:14" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "어린이흑염소진액", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "22:22" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "60대 엄마 선물", category: "취미이야기", type: "ad", keywordType: "competitor-advocacy", accountId: "br5rbg", time: "22:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "폭싹 속았수다 보면서 마켓컬리 새벽배송 김밥 시킨 일요일 밤", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "22:38" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "21세기 대군부인 아이유 변우석 보면서 야식 라면 시키는 일요일 밤", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "22:46" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "고등학생 비타민", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "22:54" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갈근탕 효능", category: "한약재정보", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "23:02" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "활성형 엽산", category: "건강이야기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "23:10" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "루이비통 카퓌신 BB 갈레 일요일 밤 매장 가격 비교 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "23:18" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신준비 금연 성공", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "23:26" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "모유수유 흑염소", category: "질문게시판", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "23:34" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "60대 여자 선물", category: "취미이야기", type: "ad", keywordType: "competitor-advocacy", accountId: "orangeswan630", time: "23:42" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "무신사 봄세일 장바구니 30만원 넘어서 망설이는 일요일 자정", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "23:50" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "무신사 봄세일 보다가 샤넬 자켓 위시리스트 옮기는 일요일 자정", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "23:58" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김소형 흑염소 스틱", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "00:06" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "50세 임신", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "00:14" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "영양제 복용시간", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "00:22" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "보테가 카세트 미니 폰덴테 일요일 밤 매물 찾는 중", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "00:30" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "개구리즙 효능", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "00:38" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "천호 흑염소", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "00:46" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산후 영양제", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "00:54" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "자정 다가오는데 디올 부티크 인스타 새 게시물 알림 떠서 또 봄", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "01:02" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "21세기 대군부인 아이유 코디 보고 W컨셉 봄옷 결제 직전 일요일 밤", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "01:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "동결 자연주기", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "01:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후 영양제", category: "건강상식", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "01:26" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "출산축하선물", category: "취미이야기", type: "ad", keywordType: "competitor-advocacy", accountId: "xzjmfn3f", time: "01:34" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김소형원방 흑염소진액", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "01:42" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소엑기스 복용법 효능", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "01:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "둘째출산선물", category: "자유로운이야기", type: "ad", keywordType: "competitor-advocacy", accountId: "0ehz3cb2", time: "01:58" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기 클리닉", category: "건강정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "02:06" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신 좋은 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "02:14" },
];

const loadScheduleFromFile = (filePath: string): ScheduleItem[] => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as ScheduleItem[];

  if (!Array.isArray(parsed)) {
    throw new Error(`SCHEDULE_FILE must contain an array: ${filePath}`);
  }

  return parsed;
};

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

  const activeSchedule = SCHEDULE_FILE ? loadScheduleFromFile(SCHEDULE_FILE) : SCHEDULE;
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
          : SCHEDULE_AD_PROMPT_PROFILE === "hanryeo" && HANRYEO_CAFE_IDS.has(item.cafeId)
            ? () => buildHanryeoCafePrompt({ keyword: item.keyword, category: item.category })
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
