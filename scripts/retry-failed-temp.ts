import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { addTaskJob } from "../src/shared/lib/queue";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildCompetitorKeywordPrompt } from "../src/features/viral/prompts/build-competitor-keyword-prompt";
import { getViralContentStyleForLoginId } from "../src/shared/config/user-profile";
import { buildViralPrompt } from "../src/features/viral/viral-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import type { PostJobData, ViralCommentsData } from "../src/shared/lib/queue/types";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = "21lab";

const RETRY_ITEMS = [
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "한비담 흑염소진액 효능", category: "일반 쇼핑후기", type: "ad" as const, keywordType: "competitor" as const, accountId: "uqgidh2690", delayMin: 0 },
  { cafe: "쇼핑지름신", cafeId: "25729954", keyword: "어머님 생신선물", category: "일반 쇼핑후기", type: "ad" as const, keywordType: "own" as const, accountId: "olgdmp9921", delayMin: 5 },
];

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
  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error("user not found");

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map(c => [c.cafeId, c]));
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenterIds = accounts.filter(a => a.role === "commenter").map(a => a.accountId);
  const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);

  for (const item of RETRY_ITEMS) {
    const cafe = cafeMap.get(item.cafeId);
    if (!cafe) { console.log(`❌ 카페 없음: ${item.cafeId}`); continue; }

    process.stdout.write(`[재시도] ${item.keyword} (${item.accountId}) ... `);
    try {
      const prompt = item.keywordType === "competitor"
        ? buildCompetitorKeywordPrompt({ keyword: item.keyword, keywordType: "competitor" })
        : contentStyle !== '정보'
          ? buildViralPrompt({ keyword: item.keyword, keywordType: "own" }, contentStyle)
          : buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" });

      const { content } = await generateViralContent({ prompt });
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);
      if (!title || !body) throw new Error("파싱 실패");

      const viralComments: ViralCommentsData | undefined = parsed?.comments?.length
        ? { comments: parsed.comments } : undefined;

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
        viralComments,
      };

      const delayMs = item.delayMin * 60 * 1000;
      await addTaskJob(item.accountId, jobData, delayMs);
      console.log(`✅ [${title.slice(0, 30)}...] (${item.delayMin}분 후)`);
    } catch (e) {
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  await mongoose.disconnect();
};

main().catch(e => { console.error(e); process.exit(1); });
