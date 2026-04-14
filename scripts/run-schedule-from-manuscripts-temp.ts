/**
 * 서브에이전트 원고(JSON) → 파싱 → 스케줄 큐 등록
 *
 * Usage:
 *   MANUSCRIPTS_FILES="scripts/artifacts/a.json,scripts/artifacts/b.json" \
 *   npx tsx --env-file=.env.local scripts/run-schedule-from-manuscripts-temp.ts
 */

import { readFileSync } from "fs";
import mongoose from "mongoose";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { User } from "../src/shared/models/user";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import { addTaskJob } from "../src/shared/lib/queue";
import type {
  PostJobData,
  ViralCommentsData,
} from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const MANUSCRIPTS_FILES = (
  process.env.MANUSCRIPTS_FILES || process.env.MANUSCRIPTS_FILE || ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const SCHEDULE_START_TIME = process.env.SCHEDULE_START_TIME || "";
const SCHEDULE_END_TIME = process.env.SCHEDULE_END_TIME || "";

interface ManuscriptScheduleItem {
  time: string;
  cafe: string;
  cafeId: string;
  accountId: string;
  type: "ad" | "daily" | "daily-ad";
  category: string;
  keyword: string;
  keywordType?: "own" | "competitor" | "competitor-advocacy";
  raw: string;
}

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : "";
};

const getDelayMs = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  if (target.getTime() <= now.getTime()) {
    return 0;
  }

  return target.getTime() - now.getTime();
};

const loadManuscripts = (files: string[]): ManuscriptScheduleItem[] => {
  return files.flatMap((filePath) => {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as ManuscriptScheduleItem[];
    return parsed;
  });
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  if (MANUSCRIPTS_FILES.length === 0) {
    throw new Error("MANUSCRIPTS_FILES or MANUSCRIPTS_FILE missing");
  }

  const manuscripts = loadManuscripts(MANUSCRIPTS_FILES);
  const filteredSchedule = manuscripts.filter((item) => {
    const isAfterStart = !SCHEDULE_START_TIME || item.time >= SCHEDULE_START_TIME;
    const isBeforeEnd = !SCHEDULE_END_TIME || item.time <= SCHEDULE_END_TIME;
    return isAfterStart && isBeforeEnd;
  });

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((cafe) => [cafe.cafeId, cafe]));

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();
  const accountMap = new Map(accounts.map((account) => [account.accountId, account]));
  const commenterIds = accounts
    .filter((account) => account.role === "commenter")
    .map((account) => account.accountId);

  console.log("=== 원고 기반 스케줄 큐 추가 ===");
  console.log(
    `user: ${LOGIN_ID} / files: ${MANUSCRIPTS_FILES.length}개 / writers: ${filteredSchedule.length}건 / commenters: ${commenterIds.length}명 / startFilter: ${SCHEDULE_START_TIME || "-"} / endFilter: ${SCHEDULE_END_TIME || "-"}\n`,
  );

  let totalPosts = 0;
  let failCount = 0;

  const sortedSchedule = [...filteredSchedule].sort((left, right) =>
    left.time.localeCompare(right.time),
  );

  for (const item of sortedSchedule) {
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

    const delayMs = getDelayMs(item.time);
    const typeLabels: Record<string, string> = {
      ad: "광고",
      daily: "일상",
      "daily-ad": "일상광고",
    };
    const typeLabel = typeLabels[item.type] || item.type;
    process.stdout.write(
      `[${item.time}] ${item.cafe} ${item.accountId} ${typeLabel} "${item.keyword}" ... `,
    );

    try {
      const parsed = parseViralResponse(item.raw);
      const title = parsed?.title || parseTitle(item.raw);
      const body = parsed?.body || parseBody(item.raw);

      if (!title || !body) {
        throw new Error("파싱 실패");
      }

      const isDailyAd = item.type === "daily-ad";
      const viralComments: ViralCommentsData | undefined =
        !isDailyAd && parsed?.comments?.length
          ? { comments: parsed.comments }
          : undefined;

      if (!isDailyAd && !viralComments) {
        throw new Error("댓글 파싱 실패");
      }

      const jobData: PostJobData = {
        type: "post",
        accountId: item.accountId,
        userId: user.userId,
        cafeId: item.cafeId,
        menuId: cafe.menuId,
        subject: title,
        content: body,
        rawContent: item.raw,
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
          : { viralComments }),
      };

      await addTaskJob(item.accountId, jobData, delayMs);
      totalPosts++;
      console.log(
        `✅ [${title.slice(0, 25)}...] (${Math.round(delayMs / 60000)}분 후)`,
      );
    } catch (error) {
      failCount++;
      console.log(`❌ ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("\n=== 완료 ===");
  console.log(`글 작성: ${totalPosts}건 / 실패: ${failCount}건`);
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
