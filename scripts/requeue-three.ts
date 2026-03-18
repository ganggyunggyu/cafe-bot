import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mongoose from "mongoose";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData, ViralCommentsData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = "21lab";

const TARGETS = [
  { cafeId: "25729954", keyword: "혈당낮추는음식", category: "일반 쇼핑후기", delayMs: 30_000 },
  { cafeId: "25460974", keyword: "임신흑염소진액", category: "_ 일상샤반사 📆", delayMs: 45 * 60_000 },
  { cafeId: "25729954", keyword: "스트레스영양제", category: "일반 쇼핑후기", delayMs: 75 * 60_000 },
];

const ACCOUNT_ID = "fail5644";

const main = async () => {
  const redis = new Redis("redis://localhost:6379/1", { maxRetriesPerRequest: null });
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((c) => [c.cafeId, c]));

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenterIds = accounts.filter((a) => a.role === "commenter").map((a) => a.accountId);

  const queueName = `task_${ACCOUNT_ID.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const queue = new Queue(queueName, { connection: redis });

  let success = 0;

  for (const target of TARGETS) {
    const cafe = cafeMap.get(target.cafeId);
    if (!cafe) { console.log(`❌ 카페 없음: ${target.cafeId}`); continue; }

    console.log(`\n콘텐츠 생성 중: ${target.keyword}...`);
    try {
      const prompt = buildOwnKeywordPrompt({ keyword: target.keyword, keywordType: "own" });
      const { content } = await generateViralContent({ prompt, model: "gemini-3.1-pro-preview" });
      const parsed = parseViralResponse(content);
      const title = parsed?.title;
      const body = parsed?.body;
      if (!title || !body) throw new Error("파싱 실패");

      const viralComments: ViralCommentsData | undefined = parsed?.comments?.length
        ? { comments: parsed.comments }
        : undefined;

      const jobData: PostJobData = {
        type: "post",
        accountId: ACCOUNT_ID,
        userId: user.userId,
        cafeId: target.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: body,
        rawContent: content,
        keyword: target.keyword,
        category: target.category,
        commenterAccountIds: commenterIds,
        viralComments,
      };

      const jobId = `post_${ACCOUNT_ID}_${target.keyword}_${Date.now().toString(36)}`;
      await queue.add("post", jobData, { delay: target.delayMs, jobId });
      success++;
      console.log(`✅ [${title.slice(0, 30)}...] (${Math.round(target.delayMs / 60000)}분 후) 댓글: ${viralComments?.comments?.length || 0}개`);
    } catch (e: any) {
      console.log(`❌ ${target.keyword}: ${e.message}`);
    }
  }

  console.log(`\n=== 완료: ${success}/${TARGETS.length}건 등록 ===`);
  await queue.close();
  await mongoose.disconnect();
  await redis.quit();
};

main().catch(async (e) => {
  console.error("실패:", e.message || e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
