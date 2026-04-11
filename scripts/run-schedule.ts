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
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "얼리임테기 저녁", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "17:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "다이슨 공기청정기 필터 교체하고 집안 공기 괜히 계속 보는 중", category: "자유게시판", type: "daily", accountId: "8i2vlbym", time: "17:13" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25 사진 넘기다 보니 퇴근 전 집중력 다 날아감", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "17:21" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "맘모툼 실비 청구", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "17:29" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 브링그린 티트리 시카 수딩 토너 안경만두 기획 자꾸 장바구니 넣게 됨", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "17:37" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "생리후 임신가능성 확률", category: "건강상식", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "17:45" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 22 매장 사진 보다가 데일리 코디 상상 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "17:53" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "옵티멈뉴트리션 쉐이크 다시 꺼내 마시니 운동한 기분 남", category: "건강이야기", type: "daily", accountId: "umhu0m83", time: "18:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 선물", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "18:09" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "슬립사이클 수면 점수 올라서 괜히 커피 한 잔 아끼게 됨", category: "한약재정보", type: "daily", accountId: "njmzdksm", time: "18:17" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12 체인 길이 비교하다가 저녁 약속 늦을 뻔", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "18:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "b형독감 잠복기", category: "건강이야기", type: "ad", keywordType: "own", accountId: "br5rbg", time: "18:33" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "코피 자주나는 아이 원인", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "18:41" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "대추밭백한의원 실패 확률", category: "한약재정보", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "18:49" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 월간남친 공개일 떠서 저녁 간식 고르는 중", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "18:57" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "닥터유 프로틴바 하나로 야식 참아보는 금요일 밤", category: "건강 챌린지", type: "daily", accountId: "beautifulelephant274", time: "19:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "아이 흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "19:13" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 31 Mini Shopping Bag 후기만 계속 읽는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "19:21" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "마보 10분 명상 틀고 나니 오후 집중이 좀 나아짐", category: "건강정보", type: "daily", accountId: "xzjmfn3f", time: "19:29" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "기관지염 가래", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "19:37" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Spring Summer 2026 Pre-Collection 밝은 트위드 체크 계속 생각남", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "19:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "자궁 후굴 원인", category: "건강정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "19:53" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "삼성 헬스 만보기 보면서 저녁 산책 30분 채우는 중", category: "오늘의 운동", type: "daily", accountId: "tinyfish183", time: "20:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 브링그린 500mL 기획 볼 때마다 세일 끝날까 조급", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "20:09" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "제왕절개 압박스타킹", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "20:17" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 25랑 Maxi Hobo Bag 중 첫 가방 뭐가 나을지 고민", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "20:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "오므론 혈압측정기 숫자 적는 습관 오늘도 겨우 성공", category: "자유게시판", type: "daily", accountId: "0ehz3cb2", time: "20:33" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "제왕절개 실비 청구", category: "취미이야기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "20:41" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신준비영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "20:49" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "성장주사", category: "질문게시판", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "20:57" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Small Bowling Bag 컬러 보다가 갑자기 약속 가방 고민", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "21:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "쿠팡에서 폼롤러 주문한 거 와서 종아리 풀다 하루 끝남", category: "건강이야기", type: "daily", accountId: "heavyzebra240", time: "21:13" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 이 사랑 통역 되나요 소식 다시 보다 보니 저녁시간 순삭", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "21:21" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "삼성 비스포크 공기청정기 먼지 표시 보면서 환기 타이밍 재는 중", category: "한약재정보", type: "daily", accountId: "br5rbg", time: "21:29" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "클래식 11.12랑 CHANEL 22 둘 다 놓기 어려움", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "21:37" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "둘째임신", category: "건강 관리 후기", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "21:45" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "21:53" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "난임치료휴가", category: "자유게시판", type: "ad", keywordType: "own", accountId: "beautifulelephant274", time: "22:01" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "공진단가격", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "22:09" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "나이키 런클럽 켜고 걷기 페이스 보는 재미 생김", category: "건강 챌린지", type: "daily", accountId: "suc4dce7", time: "22:17" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "2.55랑 CHANEL 22 중 뭐부터 볼지 아직도 못 정함", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "22:25" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "스타벅스 디카페인 라떼로 바꿔보니 밤 루틴이 조금 편해짐", category: "건강정보", type: "daily", accountId: "angrykoala270", time: "22:33" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "산후도우미 신청기간", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "xzjmfn3f", time: "22:41" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "흑염소즙 임신 준비", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "22:49" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "하단 난임병원", category: "질문게시판", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "23:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "넷플릭스 원더풀스 캐스팅 보다가 주말 정주행 리스트 적는 중", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "23:13" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "필로우 낮잠 알람 맞춰두니 오후 덜 무너지는 느낌", category: "오늘의 운동", type: "daily", accountId: "8ua1womn", time: "23:21" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어린이흑염소진액", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "23:29" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "Spring Summer 2026 쇼핑백 컬러 비교하다가 시간 순삭", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "22:57" },
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
