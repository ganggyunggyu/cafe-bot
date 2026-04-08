/**
 * 실패 1건 재시도
 * Usage: npx tsx --env-file=.env.local scripts/run-schedule-retry.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";

const RETRY_ITEM = {
  cafe: "쇼핑지름신",
  cafeId: "25729954",
  keyword: "어린이 면역력 영양제",
  category: "일반 쇼핑후기",
  type: "ad" as const,
  keywordType: "own" as const,
  accountId: "uqgidh2690",
  time: "17:45",
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
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafe = cafes.find((c) => c.cafeId === RETRY_ITEM.cafeId);
  if (!cafe) throw new Error("카페 없음");

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenterIds = accounts.filter((a) => a.role === "commenter").map((a) => a.accountId);

  console.log(`재시도: ${RETRY_ITEM.keyword} (${RETRY_ITEM.accountId})`);

  const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
  const prompt = contentStyle !== '정보'
    ? buildViralPrompt({ keyword: RETRY_ITEM.keyword, keywordType: "own" }, contentStyle)
    : buildOwnKeywordPrompt({ keyword: RETRY_ITEM.keyword, keywordType: "own" });

  const { content } = await Promise.race([
    generateViralContent({ prompt }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("API timeout 60s")), 60000)),
  ]);
  const parsed = parseViralResponse(content);
  const title = parsed?.title || parseTitle(content);
  const body = parsed?.body || parseBody(content);
  if (!title || !body) throw new Error("파싱 실패");

  const viralComments = parsed?.comments?.length ? { comments: parsed.comments } : undefined;

  const jobData: PostJobData = {
    type: "post",
    accountId: RETRY_ITEM.accountId,
    userId: user.userId,
    cafeId: RETRY_ITEM.cafeId,
    menuId: cafe.menuId,
    subject: title,
    content: body,
    rawContent: content,
    keyword: RETRY_ITEM.keyword,
    category: RETRY_ITEM.category,
    postType: RETRY_ITEM.type,
    commenterAccountIds: commenterIds,
    ...(viralComments && { viralComments }),
  };

  await addTaskJob(RETRY_ITEM.accountId, jobData, 0);
  console.log(`✅ [${title.slice(0, 30)}...] 즉시 실행`);
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error("retry failed:", e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
