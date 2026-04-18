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
  // === Cycle 1: 쇼핑 자사 광고 + 건강카페 교차 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "시흥 산후도우미", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "16:10" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "3일배양 12일차 수치", category: "자유게시판", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "16:17" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "수원난임병원", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "16:24" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "서울 흑염소 맛집", category: "취미이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "16:31" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "경주밭백한의원", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "16:38" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "이경재흑염소진액", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "16:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "부산 산후보약", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "16:52" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "삼성동 산부인과", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "16:59" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "경주 대추밭한의원", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "17:06" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "배란기 몸무게 증가", category: "건강상식", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "17:13" },

  // === Cycle 2: 샤넬 일상광고 + 건강카페 교차 ===
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "제주산 당찬여주 발효효소", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "17:20" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신", category: "건강이야기", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "17:27" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "다이어트 유산균 비에날씬", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "17:34" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "경주 대추밭한의원 예약 가격", category: "한약재정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "17:41" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "갱년기유산균YT1 메노락토 오리진", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "17:48" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "서면산부인과", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "17:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "제주산 당찬여주 발효효소_체험분", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "18:02" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "딸 낳는법", category: "건강정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "18:09" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "정관장 홍삼활력플러스업", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "18:16" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "여의도 산후조리원", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "18:23" },

  // === Cycle 3: 쇼핑 타사 광고 + 건강카페 교차 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비너지 대마종자유", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "olgdmp9921", time: "18:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난소나이검사 수치 평균", category: "질문게시판", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "18:37" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "오한진의 백세알부민", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "yenalk", time: "18:44" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "속초 산부인과", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "18:51" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "홍삼진고 데일리스틱", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "eytkgy5500", time: "18:58" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "생리전 몸무게 증가", category: "자유게시판", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "19:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "카무트 영양견과바", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "uqgidh2690", time: "19:12" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "두레생협흑염소", category: "취미이야기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "19:19" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "미녀의 석류 콜라겐", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor", accountId: "4giccokx", time: "19:26" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "이경제흑염소진액원", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "19:33" },

  // === Cycle 4: 샤넬 일상 + 건강카페 교차 ===
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "겹벚꽃 구경 나가면서 샤넬 26 크루즈 트위드 재킷 코디 고민 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "19:40" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "여의도 산부인과", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "19:47" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "신이랑 법률사무소 유연석 시계 샤넬 J12인지 확인하는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "19:54" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "대추밭백한의원 가격", category: "한약재정보", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "20:01" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "올리브영 루즈 코코 봄 신상 발색 인스타에서 보다가 지름 직전", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "20:08" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "임신 좋은 음식", category: "건강이야기", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "20:15" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "21세기 대군부인 아이유 금토 방송 보면서 샤넬 카탈로그 넘기는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "20:22" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "코로나 기침", category: "건강상식", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "20:29" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "하트시그널5 정규리 가방 샤넬 클래식 미디움인 것 같은데", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "20:36" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "양산 산부인과", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "20:43" },

  // === Cycle 5: 쇼핑 일상 + 건강카페 마무리 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "21세기 대군부인 아이유 한복 노리개 어디꺼인지 검색하다 쇼핑몰 장바구니 채움", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "20:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "관계 후 착상혈", category: "건강정보", type: "ad", keywordType: "own", accountId: "br5rbg", time: "20:57" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "하트시그널5 강유경 착장 검색하다 무신사에서 비슷한 원피스 찾아버림", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "21:04" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "강북 산후조리원", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "21:11" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 팩클렌저 아렌시아 풀리 둘 다 사서 금요일 저녁 셀프 관리", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "21:18" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "45세 임신확률", category: "질문게시판", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "21:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 비비고 왕교자 만두 대용량 세일 발견해서 장바구니 폭발", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "21:32" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "군포 산부인과", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "21:39" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 산리오 시나모롤 파우치 신상 나왔길래 금요일 밤 득템", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "21:46" },
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
