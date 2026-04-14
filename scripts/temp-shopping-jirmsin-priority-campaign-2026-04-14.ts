import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildCompetitorAdvocacyPrompt } from "../src/features/viral/prompts/build-competitor-advocacy-prompt";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData, ViralCommentsData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const MODEL = "gemini-3.1-pro-preview";

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  category: string;
  keyword: string;
  type: "ad" | "daily";
  keywordType?: "own" | "competitor-advocacy";
  accountId: string;
  time: string;
}

const SCHEDULE: ScheduleItem[] = [
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "출산후좋은음식",
    type: "ad",
    keywordType: "own",
    accountId: "olgdmp9921",
    time: "17:10",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일상톡톡",
    keyword: "올리브영 브링그린 티트리 시카 수딩 토너 세일창 또 켜두는 중",
    type: "daily",
    accountId: "4giccokx",
    time: "17:35",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "장모님선물",
    type: "ad",
    keywordType: "own",
    accountId: "uqgidh2690",
    time: "18:00",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일상톡톡",
    keyword: "넷플릭스 월간남친 라인업 보다 보니 저녁 준비가 밀림",
    type: "daily",
    accountId: "eytkgy5500",
    time: "18:25",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "부모님생일선물",
    type: "ad",
    keywordType: "own",
    accountId: "yenalk",
    time: "18:50",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "임산부칼마디",
    type: "ad",
    keywordType: "own",
    accountId: "4giccokx",
    time: "19:15",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일상톡톡",
    keyword: "올리브영 닥터지 레드 블레미쉬 수딩 크림 기획 또 장바구니 넣음",
    type: "daily",
    accountId: "olgdmp9921",
    time: "19:40",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "청소년키크는영양제",
    type: "ad",
    keywordType: "own",
    accountId: "eytkgy5500",
    time: "20:05",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일상톡톡",
    keyword: "넷플릭스 원더풀스 소식 보고 주말 정주행 리스트 다시 적는 중",
    type: "daily",
    accountId: "uqgidh2690",
    time: "20:30",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "고등학생영양제",
    type: "ad",
    keywordType: "own",
    accountId: "olgdmp9921",
    time: "20:55",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "임신초기좋은음식",
    type: "ad",
    keywordType: "own",
    accountId: "yenalk",
    time: "21:20",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일상톡톡",
    keyword: "쿠팡 로켓프레시 샐러드 담다가 생활용품까지 같이 보게 됨",
    type: "daily",
    accountId: "4giccokx",
    time: "21:45",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "야간뇨",
    type: "ad",
    keywordType: "own",
    accountId: "uqgidh2690",
    time: "22:10",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "카무트 효소",
    type: "ad",
    keywordType: "competitor-advocacy",
    accountId: "eytkgy5500",
    time: "22:35",
  },
  {
    cafe: "쇼핑지름신",
    cafeId: "25729954",
    category: "일반 쇼핑후기",
    keyword: "출산준비물",
    type: "ad",
    keywordType: "own",
    accountId: "yenalk",
    time: "23:00",
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

const buildPrompt = (item: ScheduleItem): string => {
  if (item.type === "daily") {
    return buildShortDailyPrompt({
      keyword: item.keyword,
      keywordType: "own",
    });
  }

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

  console.log("=== 쇼핑지름신 우선 스케줄 캠페인 ===");
  console.log(`user: ${LOGIN_ID} / jobs: ${SCHEDULE.length} / commenters: ${commenterIds.length}`);
  console.log("");
  for (const item of SCHEDULE) {
    const typeLabel =
      item.type === "daily"
        ? "daily"
        : item.keywordType === "competitor-advocacy"
          ? "competitor-advocacy"
          : "own";
    console.log(
      `${item.time} | ${item.cafe} | ${item.category} | ${typeLabel} | ${item.keyword} | ${item.accountId}`,
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
