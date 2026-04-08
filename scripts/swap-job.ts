/**
 * 김오곤 → 흑염소즙 브랜드 큐 교체
 * Usage: npx tsx --env-file=.env.local scripts/swap-job.ts
 */
import mongoose from "mongoose";
import { Queue } from "bullmq";
import IORedis from "ioredis";
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
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const ACCOUNT_ID = "uqgidh2690";

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(`task_${ACCOUNT_ID}`, { connection });

  // 1. 김오곤 잡 찾아서 삭제
  const delayed = await queue.getDelayed();
  let removed = false;
  let originalDelay = 0;

  for (const job of delayed) {
    const data = job.data as PostJobData;
    if (data.type === "post" && data.keyword?.includes("김오곤")) {
      originalDelay = job.opts?.delay || 0;
      const remaining = (job.timestamp + originalDelay) - Date.now();
      console.log(`김오곤 잡 발견: ${job.id} (남은시간: ${Math.round(remaining / 60000)}분)`);
      await job.remove();
      removed = true;
      console.log("✅ 삭제 완료");
      break;
    }
  }

  if (!removed) {
    console.log("⚠️ 김오곤 잡 못 찾음 (이미 발행됐거나 없음)");
    await connection.quit();
    await mongoose.disconnect();
    return;
  }

  // 2. 흑염소즙 브랜드 원고 생성 + 큐 추가
  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error("user not found");

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafe = cafes.find((c) => c.cafeId === "25729954");
  if (!cafe) throw new Error("카페 없음");

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenterIds = accounts.filter((a) => a.role === "commenter").map((a) => a.accountId);

  console.log("흑염소즙 브랜드 원고 생성 중...");

  const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
  const prompt = contentStyle !== '정보'
    ? buildViralPrompt({ keyword: "흑염소즙 브랜드", keywordType: "own" }, contentStyle)
    : buildOwnKeywordPrompt({ keyword: "흑염소즙 브랜드", keywordType: "own" });

  const { content } = await Promise.race([
    generateViralContent({ prompt }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("API timeout 60s")), 60000)),
  ]);

  const parsed = parseViralResponse(content);
  const title = parsed?.title || parseTitle(content);
  const body = parsed?.body || parseBody(content);
  if (!title || !body) throw new Error("파싱 실패");

  const viralComments = parsed?.comments?.length ? { comments: parsed.comments } : undefined;

  // 22:40 기준 남은 시간 계산
  const now = new Date();
  const target = new Date(now);
  target.setHours(22, 40, 0, 0);
  const delayMs = Math.max(0, target.getTime() - now.getTime());

  const jobData: PostJobData = {
    type: "post",
    accountId: ACCOUNT_ID,
    userId: user.userId,
    cafeId: "25729954",
    menuId: cafe.menuId,
    subject: title,
    content: body,
    rawContent: content,
    keyword: "흑염소즙 브랜드",
    category: "일반 쇼핑후기",
    postType: "ad",
    commenterAccountIds: commenterIds,
    ...(viralComments && { viralComments }),
  };

  await addTaskJob(ACCOUNT_ID, jobData, delayMs);
  console.log(`✅ [${title.slice(0, 30)}...] (${Math.round(delayMs / 60000)}분 후)`);

  await connection.quit();
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("swap failed:", e.message); process.exit(1); });
