import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData, ViralCommentsData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = "21lab";

const TARGET = {
  cafe: "쇼핑지름신",
  cafeId: "25729954",
  keyword: "혈당낮추는음식",
  category: "일반 쇼핑후기",
  type: "ad" as const,
  accountId: "fail5644",
  delayMs: 30_000,
};

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafe = await Cafe.findOne({ userId: user.userId, cafeId: TARGET.cafeId, isActive: true }).lean();
  if (!cafe) throw new Error(`cafe not found: ${TARGET.cafeId}`);

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenterIds = accounts.filter((a) => a.role === "commenter").map((a) => a.accountId);

  console.log(`콘텐츠 생성 중: ${TARGET.keyword}...`);

  const prompt = buildOwnKeywordPrompt({ keyword: TARGET.keyword, keywordType: "own" });
  const { content } = await generateViralContent({
    prompt,
    model: "gemini-3.1-pro-preview",
  });

  const parsed = parseViralResponse(content);
  const title = parsed?.title;
  const body = parsed?.body;
  if (!title || !body) throw new Error("파싱 실패");

  const viralComments: ViralCommentsData | undefined = parsed?.comments?.length
    ? { comments: parsed.comments }
    : undefined;

  const jobData: PostJobData = {
    type: "post",
    accountId: TARGET.accountId,
    userId: user.userId,
    cafeId: TARGET.cafeId,
    menuId: cafe.menuId,
    subject: title,
    content: body,
    rawContent: content,
    keyword: TARGET.keyword,
    category: TARGET.category,
    commenterAccountIds: commenterIds,
    viralComments,
  };

  await addTaskJob(TARGET.accountId, jobData, TARGET.delayMs);
  console.log(`✅ 큐 등록 완료: [${title.slice(0, 30)}...] (${Math.round(TARGET.delayMs / 1000)}초 후)`);
  console.log(`댓글 수: ${viralComments?.comments?.length || 0}개`);

  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error("❌ 실패:", e.message || e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
