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
  // === 1구간 (10:00~11:00): 쇼핑/샤넬 교차 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "천호 흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "10:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 25백 스몰 1000만원 넘었다는 기사 보고 한숨만 나옴", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "yenalk", time: "11:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이경제흑염소120포", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "11:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 코코 크러쉬 네크리스 봄 시즌 실물 보러 매장 예약함", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "uqgidh2690", time: "11:40" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신준비 남편 영양제", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "11:55" },

  // === 2구간 (11:05~12:20): 타사옹호 + 건강카페 광고 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "콜라겐 비오틴", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "olgdmp9921", time: "12:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "홍성호 울릉도 마가목 흑염소진액", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "12:05" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "콘드로이친 킹", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "12:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "염소즙 가격", category: "자유로운이야기", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "12:20" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "매스틱 유산균", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "eytkgy5500", time: "12:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "경주 한의원 난임", category: "질문게시판", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "12:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "레티놀 A", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "uqgidh2690", time: "12:45" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "성장호르몬 검사 과정", category: "건강이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "12:50" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "비에날씬 유산균", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "4giccokx", time: "13:00" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "풍산원 흑염소 진액", category: "한약재정보", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "13:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "성장판검사비용", category: "건강이야기", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "13:15" },

  // === 3구간 (12:30~13:30): 쇼핑/샤넬 교차 ===
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 코코 크러쉬 링 파인주얼리 5% 인상 소식에 심장 쿵", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "olgdmp9921", time: "13:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "김소형 흑염소 스틱", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "13:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "CHANEL 클래식 플랩백 가격 2000만원 돌파했다길래 멘붕", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "eytkgy5500", time: "13:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "임신 준비물 엽산", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "14:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "50세 출산", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "4giccokx", time: "14:25" },

  // === 4구간 (13:40~14:50): 건강노후 일상 + 타사옹호 ===
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "올리브영 비타민D 츄어블 하나씩 챙겨먹기 시작한 지 한 달", category: "건강상식", type: "daily", accountId: "tinyfish183", time: "14:35" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "유산균", category: "일반 쇼핑후기", type: "ad", keywordType: "competitor-advocacy", accountId: "yenalk", time: "14:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "삼성헬스 걸음수 점심시간 산책으로 만보 도전 중", category: "자유게시판", type: "daily", accountId: "e6yb5u4k", time: "14:50" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "쿠팡 로켓프레시 현미밥 세트 시켜 먹기 시작한 지 2주째", category: "건강정보", type: "daily", accountId: "suc4dce7", time: "15:05" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "21세기 대군부인 변우석 몸매 보고 저속노화 실천 결심함", category: "자유게시판", type: "daily", accountId: "umhu0m83", time: "15:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "유미의 세포들3 김고은 보면서 감정 세포 살려야겠다 싶은 금요일", category: "질문게시판", type: "daily", accountId: "beautifulelephant274", time: "15:35" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "닥터자르트 콜라겐 이너뷰티 젤리 하루 하나 먹는 습관", category: "건강정보", type: "daily", accountId: "0ehz3cb2", time: "15:45" },

  // === 5구간 (15:00~16:00): 쇼핑/샤넬 교차 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "녹색흑염소", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "olgdmp9921", time: "15:55" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "스타벅스 제주 유기농 말차 라떼 마시면서 샤넬 인스타 구경하는 금요일", category: "_ 일상샤반사 📆", type: "daily", accountId: "yenalk", time: "16:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "이경제 흑염소 진액진", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "eytkgy5500", time: "16:25" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "유미의 세포들3 김고은 귀걸이 샤넬 코코 크러쉬인지 확인하는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "uqgidh2690", time: "16:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "샤넬 프리미에르 워치 가격 또 올랐는데 그래도 갖고 싶음", category: "_ 일상샤반사 📆", type: "daily-ad", accountId: "4giccokx", time: "16:55" },

  // === 6구간 (16:10~17:15): 건강카페 일상 ===
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "스타벅스 디카페인 카페라떼로 바꾸니 밤에 좀 나은 느낌", category: "건강상식", type: "daily", accountId: "xzjmfn3f", time: "17:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "나이키 런클럽 5km 기록 줄이는 재미에 빠짐", category: "오늘의 운동", type: "daily", accountId: "8i2vlbym", time: "17:20" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "종근당 비타민B 복합체 먹기 시작한 지 일주일째 좀 나은 듯", category: "한약재정보", type: "daily", accountId: "br5rbg", time: "17:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유튜브 핏블리 어깨 스트레칭 따라하니 뻐근함이 풀림", category: "오늘의 운동", type: "daily", accountId: "njmzdksm", time: "17:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "애플워치 수면 분석 처음 봤는데 생각보다 수면 짧아서 놀람", category: "건강이야기", type: "daily", accountId: "tinyfish183", time: "18:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "다이소 텀블러 사서 물 2리터 챌린지 도전 3일차", category: "건강 챌린지", type: "daily", accountId: "e6yb5u4k", time: "18:10" },

  // === 7구간 (17:30~18:30): 쇼핑/샤넬 교차 ===
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "21세기 대군부인 아이유 봄 스타일링 보면서 샤넬 매거진 꺼냄", category: "_ 일상샤반사 📆", type: "daily", accountId: "olgdmp9921", time: "18:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "산모음식", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "yenalk", time: "18:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "올리브영 올영데이 준비하면서 샤넬 립스틱 재고 확인하는 중", category: "_ 일상샤반사 📆", type: "daily", accountId: "eytkgy5500", time: "18:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "출산후 붓기 차 한약", category: "일반 쇼핑후기", type: "ad", keywordType: "own", accountId: "uqgidh2690", time: "19:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "21세기 대군부인 아이유 한복 장신구 보고 악세사리 쇼핑 욕구 폭발", category: "일상톡톡", type: "daily", accountId: "4giccokx", time: "19:25" },

  // === 8구간 (18:40~19:45): 건강카페 일상 ===
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "편의점 CU 고단백 두유 간식으로 챙겨 먹는 요즘", category: "건강정보", type: "daily", accountId: "angrykoala270", time: "19:35" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "오므론 혈압계 아침저녁 기록하는 게 이제 습관됨", category: "건강 관리 후기", type: "daily", accountId: "suc4dce7", time: "19:50" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "쿠팡 로켓배송 닭가슴살 도시락 냉장고에 쟁여놓는 중", category: "취미이야기", type: "daily", accountId: "umhu0m83", time: "20:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "유튜브 제이제이살롱드핏 등운동 따라하니 자세가 바뀌는 느낌", category: "자유로운이야기", type: "daily", accountId: "xzjmfn3f", time: "20:10" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "편의점 프로틴바 하루 하나 사 먹는 게 요즘 루틴", category: "자유로운이야기", type: "daily", accountId: "br5rbg", time: "20:25" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "21세기 대군부인 아이유 보면서 건강차 한 잔", category: "취미이야기", type: "daily", accountId: "orangeswan630", time: "20:40" },

  // === 9구간 (20:00~21:00): 쇼핑/샤넬 일상 마무리 ===
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "올리브영 올영데이 4/25 대기 중인데 장바구니 벌써 10만원 넘음", category: "일상톡톡", type: "daily", accountId: "olgdmp9921", time: "20:55" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "유미의 세포들3 김고은 착장 검색하다 쿠팡에서 비슷한 거 장바구니 담음", category: "일상톡톡", type: "daily", accountId: "yenalk", time: "21:10" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "다이소 산리오 쿠로미 파우치 신상 금요일 저녁에 득템함", category: "일상톡톡", type: "daily", accountId: "eytkgy5500", time: "21:25" },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "쿠팡 로켓배송 비비고 왕교자 만두 대용량 세일이라 냉동실 채움", category: "일상톡톡", type: "daily", accountId: "uqgidh2690", time: "21:40" },
  { cafe: "샤넬오픈런", cafeId: "25460974", keyword: "인스타 릴스에서 블랙핑크 제니 샤넬 앰버서더 화보 보다가 잠 안 옴", category: "_ 일상샤반사 📆", type: "daily", accountId: "4giccokx", time: "21:55" },
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
