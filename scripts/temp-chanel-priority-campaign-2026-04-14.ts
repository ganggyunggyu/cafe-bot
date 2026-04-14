import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
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
  type: "daily" | "daily-ad";
  accountId: string;
  time: string;
}

const SCHEDULE: ScheduleItem[] = [
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "CHANEL 25 미니 화이트 컬러 보다가 또 출근 준비 미뤄졌어요",
    type: "daily-ad",
    accountId: "eytkgy5500",
    time: "17:15",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "Classic 11.12 트위드 디테일 보는데 저녁 약속 룩까지 다시 고민돼요",
    type: "daily-ad",
    accountId: "yenalk",
    time: "17:40",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "Spring Summer 2026 다크 버건디 2.55 사진 자꾸 저장하게 되네요",
    type: "daily-ad",
    accountId: "olgdmp9921",
    time: "18:25",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "Small Shopping Bag 다크 버건디 보니까 코트 컬러까지 다시 보게 돼요",
    type: "daily-ad",
    accountId: "uqgidh2690",
    time: "19:05",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "Maxi Hobo Bag 라이트 베이지 실루엣이 밤마다 더 생각나요",
    type: "daily-ad",
    accountId: "4giccokx",
    time: "20:30",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "2.55랑 Classic 11.12 중 첫 가방 아직도 못 정하겠어요",
    type: "daily",
    accountId: "yenalk",
    time: "20:05",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "CHANEL 22 미니 화이트 다시 보는데 데일리로 들기엔 딱 같아요",
    type: "daily",
    accountId: "eytkgy5500",
    time: "21:20",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "CHANEL 25 포켓 디테일 보다 보니 오늘도 스크롤이 안 멈추네요",
    type: "daily",
    accountId: "olgdmp9921",
    time: "22:10",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "Spring Summer 2026 쇼핑백 컬러 비교하다가 시간 순삭됐어요",
    type: "daily",
    accountId: "4giccokx",
    time: "23:00",
  },
  {
    cafe: "샤넬오픈런",
    cafeId: "25460974",
    category: "_ 일상샤반사 📆",
    keyword: "Large Hobo Bag 블랙 라인 보니까 가을 코디까지 상상하게 되네요",
    type: "daily",
    accountId: "uqgidh2690",
    time: "23:25",
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

const buildPrompt = (item: ScheduleItem): string =>
  buildShortDailyPrompt({
    keyword: item.keyword,
    keywordType: "own",
  });

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

  console.log("=== 샤넬 우선 스케줄 캠페인 ===");
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

      const isDailyAd = item.type === "daily-ad";
      const viralComments: ViralCommentsData | undefined =
        !isDailyAd && parsed?.comments?.length
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
        ...(isDailyAd
          ? {
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
            }
          : {}),
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
