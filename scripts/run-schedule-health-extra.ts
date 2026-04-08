/**
 * 건강카페 추가 12건 보충 스크립트
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-schedule-health-extra.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";

interface ScheduleItem {
  cafe: string;
  cafeId: string;
  keyword: string;
  category: string;
  type: "ad";
  keywordType: "own";
  accountId: string;
  time: string;
}

const SCHEDULE: ScheduleItem[] = [
  // 건강한노후준비 추가 6건 (카테고리당 2개 맞추기)
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "임산부 영양제", category: "건강상식", type: "ad", keywordType: "own", accountId: "tinyfish183", time: "18:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "갱년기에좋은음식", category: "건강정보", type: "ad", keywordType: "own", accountId: "8ua1womn", time: "19:15" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "산후조리 음식", category: "자유게시판", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "19:45" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "흑염소진액 먹는법", category: "흑염소진액정보", type: "ad", keywordType: "own", accountId: "0ehz3cb2", time: "20:40" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "공진단 효능", category: "질문게시판", type: "ad", keywordType: "own", accountId: "angrykoala270", time: "21:30" },
  { cafe: "건강한노후준비", cafeId: "25636798", keyword: "만성피로 원인", category: "한약재정보", type: "ad", keywordType: "own", accountId: "umhu0m83", time: "22:25" },

  // 건강관리소 추가 6건 (빈 카테고리 채우기)
  { cafe: "건강관리소", cafeId: "25227349", keyword: "수족냉증 영양제", category: "취미이야기", type: "ad", keywordType: "own", accountId: "8i2vlbym", time: "18:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "혈액순환 영양제", category: "취미이야기", type: "ad", keywordType: "own", accountId: "heavyzebra240", time: "19:05" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "면역력높이는방법", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "njmzdksm", time: "20:00" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "갱년기 영양제", category: "오늘의 운동", type: "ad", keywordType: "own", accountId: "e6yb5u4k", time: "21:10" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "흑염소즙 효능", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "suc4dce7", time: "22:15" },
  { cafe: "건강관리소", cafeId: "25227349", keyword: "피로회복영양제", category: "건강 챌린지", type: "ad", keywordType: "own", accountId: "orangeswan630", time: "22:35" },
];

const SCRIPT_START = Date.now();

const getDelayMs = (timeStr: string): number => {
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date(SCRIPT_START);
  target.setHours(h, m, 0, 0);
  if (target.getTime() <= SCRIPT_START) return 0;
  return target.getTime() - SCRIPT_START;
};

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c]));

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenterIds = accounts.filter((a) => a.role === "commenter").map((a) => a.accountId);

  console.log(`=== 건강카페 추가 12건 ===\n`);

  let totalPosts = 0;
  let failCount = 0;

  const sortedSchedule = [...SCHEDULE].sort((a, b) => a.time.localeCompare(b.time));

  for (const item of sortedSchedule) {
    const delayMs = getDelayMs(item.time);
    const cafe = cafeMap.get(item.cafeId);
    if (!cafe) { console.log(`❌ 카페 없음: ${item.cafeId}`); failCount++; continue; }

    process.stdout.write(`[${item.time}] ${item.cafe} ${item.accountId} 광고 "${item.keyword}" ... `);

    try {
      const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
      const prompt = contentStyle !== '정보'
        ? buildViralPrompt({ keyword: item.keyword, keywordType: "own" }, contentStyle)
        : buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" });

      const { content } = await generateViralContent({ prompt });
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);
      if (!title || !body) throw new Error(`파싱 실패`);

      const viralComments = parsed?.comments?.length ? { comments: parsed.comments } : undefined;

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

      await addTaskJob(item.accountId, jobData, delayMs);
      totalPosts++;
      console.log(`✅ [${title.slice(0, 25)}...] (${Math.round(delayMs / 60000)}분 후)`);
    } catch (e) {
      failCount++;
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n=== 완료 === 성공: ${totalPosts}건 / 실패: ${failCount}건`);
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error("health-extra failed:", e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
