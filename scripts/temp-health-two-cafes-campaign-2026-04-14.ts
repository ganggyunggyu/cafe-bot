import mongoose from "mongoose";
import { User } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/models/user.ts";
import { Account } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/models/account.ts";
import { Cafe } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/models/cafe.ts";
import { addTaskJob } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/lib/queue/index.ts";
import { generateViralContent } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/api/content-api.ts";
import { buildViralPrompt } from "/Users/ganggyunggyu/Programing/cafe-bot/src/features/viral/viral-prompt.ts";
import { buildOwnKeywordPrompt } from "/Users/ganggyunggyu/Programing/cafe-bot/src/features/viral/prompts/build-own-keyword-prompt.ts";
import { buildCompetitorAdvocacyPrompt } from "/Users/ganggyunggyu/Programing/cafe-bot/src/features/viral/prompts/build-competitor-advocacy-prompt.ts";
import { getViralContentStyleForLoginId } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/config/user-profile.ts";
import { parseViralResponse } from "/Users/ganggyunggyu/Programing/cafe-bot/src/features/viral/viral-parser.ts";
import type { PostJobData, ViralCommentsData } from "/Users/ganggyunggyu/Programing/cafe-bot/src/shared/lib/queue/types.ts";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const MODEL = "gemini-3.1-pro-preview";
const SCRIPT_START = Date.now();

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  category: string;
  keyword: string;
  keywordType: "own" | "competitor-advocacy";
  accountId: string;
  offsetMinutes: number;
}

const SCHEDULE: ScheduleItem[] = [
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강이야기",
    keyword: "비에날씬",
    keywordType: "competitor-advocacy",
    accountId: "8i2vlbym",
    offsetMinutes: 5,
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "자유게시판",
    keyword: "부모님생일선물",
    keywordType: "own",
    accountId: "heavyzebra240",
    offsetMinutes: 9,
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "자유로운이야기",
    keyword: "매스틱 유산균",
    keywordType: "competitor-advocacy",
    accountId: "njmzdksm",
    offsetMinutes: 13,
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "흑염소진액정보",
    keyword: "파로효소",
    keywordType: "competitor-advocacy",
    accountId: "suc4dce7",
    offsetMinutes: 17,
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "취미이야기",
    keyword: "장모님선물",
    keywordType: "own",
    accountId: "xzjmfn3f",
    offsetMinutes: 21,
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "한약재정보",
    keyword: "콘드로이친 MBP",
    keywordType: "competitor-advocacy",
    accountId: "8ua1womn",
    offsetMinutes: 25,
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "오늘의 운동",
    keyword: "콘드로이친 킹",
    keywordType: "competitor-advocacy",
    accountId: "0ehz3cb2",
    offsetMinutes: 29,
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "건강정보",
    keyword: "유산균",
    keywordType: "competitor-advocacy",
    accountId: "umhu0m83",
    offsetMinutes: 33,
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강 챌린지",
    keyword: "비에날씬 유산균",
    keywordType: "competitor-advocacy",
    accountId: "br5rbg",
    offsetMinutes: 37,
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "건강상식",
    keyword: "출산후좋은음식",
    keywordType: "own",
    accountId: "beautifulelephant274",
    offsetMinutes: 41,
  },
  {
    cafe: "건강관리소",
    cafeId: "25227349",
    category: "건강 관리 후기",
    keyword: "콜라겐 비오틴",
    keywordType: "competitor-advocacy",
    accountId: "angrykoala270",
    offsetMinutes: 45,
  },
  {
    cafe: "건강한노후준비",
    cafeId: "25636798",
    category: "질문게시판",
    keyword: "레티놀 A",
    keywordType: "competitor-advocacy",
    accountId: "tinyfish183",
    offsetMinutes: 49,
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

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
};

const getTargetTimestamp = (offsetMinutes: number): number =>
  SCRIPT_START + offsetMinutes * 60 * 1000;

const getDelayMs = (offsetMinutes: number): number =>
  Math.max(0, getTargetTimestamp(offsetMinutes) - Date.now());

const buildPrompt = (item: ScheduleItem): string => {
  if (item.keywordType === "competitor-advocacy") {
    return buildCompetitorAdvocacyPrompt({
      keyword: item.keyword,
      keywordType: "competitor",
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

  console.log("=== 건강카페 2곳 즉시 스케줄 캠페인 ===");
  console.log(`user: ${LOGIN_ID} / jobs: ${SCHEDULE.length} / commenters: ${commenterIds.length}`);
  console.log("");
  for (const item of SCHEDULE) {
    const targetAt = getTargetTimestamp(item.offsetMinutes);
    console.log(
      `${formatTime(targetAt)} | ${item.cafe} | ${item.category} | ${item.keywordType} | ${item.keyword} | ${item.accountId}`,
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

    const targetAt = getTargetTimestamp(item.offsetMinutes);
    process.stdout.write(
      `[${formatTime(targetAt)}] ${item.cafe} ${item.accountId} ${item.keywordType} "${item.keyword}" ... `,
    );

    try {
      const prompt = buildPrompt(item);
      const { content } = await generateViralContent({
        prompt,
        model: MODEL,
      });

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
        postType: "ad",
        commenterAccountIds: commenterIds,
        ...(viralComments && { viralComments }),
      };

      const delayMs = getDelayMs(item.offsetMinutes);
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
