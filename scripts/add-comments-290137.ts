import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import { addTaskJob } from "../src/shared/lib/queue";
import type { CommentJobData, ReplyJobData } from "../src/shared/lib/queue/types";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = "25460974";
const ARTICLE_ID = 290137;
const KEYWORD = "빈혈에좋은음식";
const WRITER_ID = "yenalk";

const FIRST_DELAY = 30 * 1000;
const BETWEEN = { min: 30 * 1000, max: 90 * 1000 };
const rand = (r: typeof BETWEEN) => r.min + Math.floor(Math.random() * (r.max - r.min));

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) throw new Error("user not found");
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const commenters = accounts.filter((a) => a.role === "commenter" && a.accountId !== WRITER_ID);
  const allAccounts: NaverAccount[] = accounts.map((a) => ({ id: a.accountId, password: a.password, nickname: a.nickname }));

  console.log("원고 생성 중...");
  const prompt = buildOwnKeywordPrompt({ keyword: KEYWORD, keywordType: "own" });
  const { content } = await generateViralContent({ prompt });
  const parsed = parseViralResponse(content);

  if (!parsed?.comments?.length) throw new Error("댓글 파싱 실패");
  console.log(`댓글 ${parsed.comments.length}개 파싱됨\n`);

  const mainComments = parsed.comments.filter((c) => c.type === "comment");
  const commentIndexMap = new Map<number, number>();
  const commentAuthorMap = new Map<number, string>();
  const commentContentMap = new Map<number, string>();
  const seqId = `direct_${Date.now().toString(36)}`;
  let orderIdx = 0;
  let cumDelay = FIRST_DELAY;
  let cIdx = 0;
  const lastReplyer = new Map<number, string>();

  mainComments.forEach((c, i) => {
    const acc = commenters[i % commenters.length];
    commentIndexMap.set(c.index, i);
    commentAuthorMap.set(c.index, acc.accountId);
    commentContentMap.set(c.index, c.content);
  });

  for (const item of parsed.comments) {
    const delay = cumDelay;

    if (item.type === "comment") {
      const accId = commentAuthorMap.get(item.index)!;
      const job: CommentJobData = {
        type: "comment", accountId: accId, userId: user.userId,
        cafeId: CAFE_ID, articleId: ARTICLE_ID, content: item.content,
        commentIndex: commentIndexMap.get(item.index), keyword: KEYWORD,
        sequenceId: seqId, sequenceIndex: orderIdx,
      };
      await addTaskJob(accId, job, delay);
      console.log(`댓글: ${accId} (${Math.round(delay/1000)}초 후) "${item.content.slice(0,40)}..."`);
    } else {
      if (item.parentIndex === undefined) continue;
      const parentOrder = commentIndexMap.get(item.parentIndex);
      if (parentOrder === undefined) continue;
      const parentAccId = commentAuthorMap.get(item.parentIndex);

      let replyerId: string;
      if (item.type === "author_reply") {
        replyerId = WRITER_ID;
      } else if (item.type === "commenter_reply") {
        replyerId = parentAccId || commenters[parentOrder % commenters.length].accountId;
      } else {
        const exclude = new Set<string>();
        if (parentAccId) exclude.add(parentAccId);
        const last = lastReplyer.get(item.parentIndex);
        if (last) exclude.add(last);
        const avail = commenters.filter((a) => !exclude.has(a.accountId));
        replyerId = avail.length > 0 ? avail[Math.floor(Math.random() * avail.length)].accountId : commenters[0].accountId;
      }
      lastReplyer.set(item.parentIndex, replyerId);

      const job: ReplyJobData = {
        type: "reply", accountId: replyerId, userId: user.userId,
        cafeId: CAFE_ID, articleId: ARTICLE_ID, content: item.content,
        commentIndex: parentOrder,
        parentComment: commentContentMap.get(item.parentIndex),
        parentNickname: parentAccId ? allAccounts.find((a) => a.id === parentAccId)?.nickname : undefined,
        keyword: KEYWORD, sequenceId: seqId, sequenceIndex: orderIdx,
      };
      await addTaskJob(replyerId, job, delay);
      console.log(`  ↳ ${item.type}: ${replyerId} (${Math.round(delay/1000)}초 후)`);
    }

    orderIdx++;
    cumDelay += rand(BETWEEN);
  }

  console.log(`\n✅ 큐 추가 완료`);
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error(e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
