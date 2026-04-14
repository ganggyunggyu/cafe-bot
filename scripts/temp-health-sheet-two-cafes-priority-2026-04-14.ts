import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData, ViralCommentsData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const MODEL = "gemini-3.1-pro-preview";
const GENERATE_TIMEOUT_MS = 120_000;
const MAX_GENERATE_ATTEMPTS = 2;

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  category: string;
  keyword: string;
  type: "ad" | "daily";
  accountId: string;
  time: string;
}

const SCHEDULE: ScheduleItem[] = [
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "자유게시판",
    keyword: "삼성 헬스 수면 점수 다시 보니까 오늘은 커피를 줄여야겠네요",
    type: "daily",
    accountId: "8i2vlbym",
    time: "17:20",
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강 챌린지",
    keyword: "우리아이예상키",
    type: "ad",
    accountId: "heavyzebra240",
    time: "17:45",
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "건강상식",
    keyword: "20대 조기폐경 증상",
    type: "ad",
    accountId: "njmzdksm",
    time: "18:10",
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "오늘의 운동",
    keyword: "나이키 런클럽 채우려고 퇴근길에 한 정거장 먼저 내렸어요",
    type: "daily",
    accountId: "suc4dce7",
    time: "18:35",
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "건강정보",
    keyword: "오므론 혈압계 숫자 적다 보니 저녁 루틴이 조금 생겼네요",
    type: "daily",
    accountId: "xzjmfn3f",
    time: "19:00",
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강이야기",
    keyword: "산후도우미",
    type: "ad",
    accountId: "8ua1womn",
    time: "19:25",
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "한약재정보",
    keyword: "임신준비 음식",
    type: "ad",
    accountId: "0ehz3cb2",
    time: "19:50",
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강 관리 후기",
    keyword: "닥터유 프로틴바 하나 챙겨두니 야식 생각이 조금 덜 나네요",
    type: "daily",
    accountId: "umhu0m83",
    time: "20:15",
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "한약재정보",
    keyword: "마보 10분 명상 켜두고 하루 정리하니 마음이 좀 가벼워지네요",
    type: "daily",
    accountId: "br5rbg",
    time: "20:40",
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강 관리 후기",
    keyword: "유아 영양제",
    type: "ad",
    accountId: "beautifulelephant274",
    time: "21:05",
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "질문게시판",
    keyword: "여성호르몬 음식",
    type: "ad",
    accountId: "angrykoala270",
    time: "21:30",
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강이야기",
    keyword: "다이슨 공기청정기 필터 갈고 나니 밤 공기가 좀 다르게 느껴져요",
    type: "daily",
    accountId: "tinyfish183",
    time: "21:55",
  },
];

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const getTargetDate = (time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  return target;
};

const getDelayMs = (time: string): number =>
  Math.max(0, getTargetDate(time).getTime() - Date.now());

const generateContentWithRetry = async (prompt: string): Promise<string> => {
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt += 1) {
    try {
      const response = await Promise.race([
        generateViralContent({
          prompt,
          model: MODEL,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("콘텐츠 생성 타임아웃")), GENERATE_TIMEOUT_MS);
        }),
      ]);

      return response.content;
    } catch (error) {
      if (attempt === MAX_GENERATE_ATTEMPTS) {
        throw error;
      }
      console.log(`재시도 ${attempt}/${MAX_GENERATE_ATTEMPTS - 1}...`);
    }
  }

  throw new Error("콘텐츠 생성 실패");
};

const buildPrompt = (item: ScheduleItem): string => {
  if (item.type === "daily") {
    return buildShortDailyPrompt({
      keyword: item.keyword,
      keywordType: "own",
    });
  }

  const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
  return contentStyle !== "정보"
    ? buildViralPrompt({ keyword: item.keyword, keywordType: "own" }, contentStyle)
    : buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" });
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI missing");
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((cafe) => [cafe.cafeId, cafe]));

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const accountMap = new Map(accounts.map((account) => [account.accountId, account]));
  const commenterIds = accounts
    .filter((account) => account.role === "commenter")
    .map((account) => account.accountId);

  console.log("=== 건강카페 2곳 시트 기반 우선 스케줄 ===");
  console.log(`user: ${LOGIN_ID} / jobs: ${SCHEDULE.length} / commenters: ${commenterIds.length}`);
  console.log("");
  for (const item of SCHEDULE) {
    console.log(
      `${item.time} | ${item.cafe} | ${item.category} | ${item.type} | ${item.keyword} | ${item.accountId}`,
    );
  }
  console.log("");

  let successCount = 0;
  let failCount = 0;

  for (const item of SCHEDULE) {
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

    process.stdout.write(
      `[${item.time}] ${item.cafe} ${item.accountId} ${item.type} "${item.keyword}" ... `,
    );

    try {
      const prompt = buildPrompt(item);
      const content = await generateContentWithRetry(prompt);

      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);

      if (!title || !body) {
        throw new Error("파싱 실패");
      }

      const viralComments: ViralCommentsData | undefined = parsed?.comments?.length
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
        ...(viralComments && { viralComments }),
      };

      const delayMs = getDelayMs(item.time);
      await addTaskJob(item.accountId, jobData, delayMs);
      successCount++;
      console.log(`✅ [${title.slice(0, 28)}...] (${Math.round(delayMs / 60000)}분 후)`);
    } catch (error) {
      failCount++;
      console.log(`❌ ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("");
  console.log(`=== 완료 === 성공: ${successCount}건 / 실패: ${failCount}건`);
};

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("fatal:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
