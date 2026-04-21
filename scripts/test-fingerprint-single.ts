/**
 * Fingerprint 적용 단건 테스트
 * qwzx16 계정으로 벤타쿠 카페에 1개 글 스케줄
 *
 * Usage:
 *   FINGERPRINT_ENABLED=true LOGIN_ID=qwzx16 npx tsx --env-file=.env.local scripts/test-fingerprint-single.ts
 */
import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildShortDailyPrompt } from "../src/features/viral/prompts/build-short-daily-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "qwzx16";

const TEST = {
  cafe: "벤타쿠",
  cafeId: "31642514",
  keyword: "오늘 들은 신곡 진짜 좋네요",
  category: "자유게시판",
  accountId: "qwzx16",
  delaySeconds: 60,
};

const parseTitle = (text: string): string => {
  const m = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return m ? m[1].trim() : "";
};
const parseBody = (text: string): string => {
  const m = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return m ? m[1].trim() : "";
};

const main = async () => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);
  console.log(`[USER] ${user.loginId} (${user.userId})`);
  console.log(`[FINGERPRINT] ${process.env.FINGERPRINT_ENABLED === "true" ? "ON" : "OFF"}`);

  const cafe = await Cafe.findOne({ userId: user.userId, cafeId: TEST.cafeId, isActive: true }).lean();
  if (!cafe) throw new Error(`cafe not found: ${TEST.cafeId}`);

  const account = await Account.findOne({ userId: user.userId, accountId: TEST.accountId, isActive: true }).lean();
  if (!account) throw new Error(`account not found: ${TEST.accountId}`);

  console.log(`\n[GEN] ${TEST.cafe} / ${TEST.accountId} / "${TEST.keyword}" (${TEST.delaySeconds}s 후 발행)`);
  const prompt = buildShortDailyPrompt({ keyword: TEST.keyword, keywordType: "own" });
  const { content } = await generateViralContent({ prompt, model: "claude-sonnet-4-6" });
  const parsed = parseViralResponse(content);
  const title = parsed?.title || parseTitle(content);
  const body = parsed?.body || parseBody(content);
  if (!title || !body) throw new Error("파싱 실패");

  console.log(`[TITLE] ${title}`);

  const jobData: PostJobData = {
    type: "post",
    accountId: TEST.accountId,
    userId: user.userId,
    cafeId: TEST.cafeId,
    menuId: cafe.menuId,
    subject: title,
    content: body,
    rawContent: content,
    keyword: TEST.keyword,
    category: TEST.category,
    postType: "daily",
    commenterAccountIds: [],
    viralComments: parsed?.comments?.length ? { comments: parsed.comments } : undefined,
  };

  await addTaskJob(TEST.accountId, jobData, TEST.delaySeconds * 1000);
  console.log(`\n✅ 큐 추가 완료. ${TEST.delaySeconds}초 후 발행됨`);

  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("실패:", e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
