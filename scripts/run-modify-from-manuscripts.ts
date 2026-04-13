/**
 * 서브에이전트가 뽑은 원고 → 파싱 → 글 수정 + 댓글큐 등록
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-modify-from-manuscripts.ts
 */

import mongoose from "mongoose";
import { readFileSync } from "fs";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models";
import { modifyArticleWithAccount } from "../src/features/auto-comment/batch/article-modifier";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import { addTaskJob } from "../src/shared/lib/queue";
import { closeContextForAccount, invalidateLoginCache } from "../src/shared/lib/multi-session";
import type {
  CommentJobData,
  ReplyJobData,
  ViralCommentsData,
} from "../src/shared/lib/queue/types";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const CAFE_ID = process.argv[2] || "31642514";
const MANUSCRIPTS_FILE = process.env.MANUSCRIPTS_FILE || "/tmp/generated-manuscripts.json";
const DELAY_BETWEEN_MODIFY_MS = parseInt(process.env.MODIFY_DELAY_MS || "", 10) || 10 * 60 * 1000;
const CHANEL_MODIFY_CATEGORY = "_ 일상샤반사 📆";
const FORCE_RELOGIN = process.env.FORCE_RELOGIN === "true";

interface Manuscript {
  articleId: number;
  keyword: string;
  raw: string;
}

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : "";
};

const parseBody = (text: string): string => {
  const match = text.match(
    /\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/,
  );
  return match ? match[1].trim() : "";
};

const FIRST_COMMENT_DELAY = 30 * 1000;
const BETWEEN_COMMENTS_DELAY = { min: 30 * 1000, max: 90 * 1000 };

const getRandomDelay = (range: { min: number; max: number }): number =>
  range.min + Math.floor(Math.random() * (range.max - range.min));

const addViralCommentJobs = async (
  articleId: number,
  cafeId: string,
  keyword: string,
  writerAccountId: string,
  userId: string | undefined,
  viralComments: ViralCommentsData,
  commenterAccounts: NaverAccount[],
  allAccounts: NaverAccount[],
): Promise<{ comments: number; replies: number }> => {
  const { comments } = viralComments;
  if (comments.length === 0 || commenterAccounts.length === 0)
    return { comments: 0, replies: 0 };

  const accountNicknameMap = new Map(
    allAccounts.map((a) => [a.id, a.nickname || a.id]),
  );

  const mainComments = comments.filter((c) => c.type === "comment");
  const commentIndexMap = new Map<number, number>();
  const commentAuthorMap = new Map<number, string>();
  const commentContentMap = new Map<number, string>();

  mainComments.forEach((comment, i) => {
    const commenter = commenterAccounts[i % commenterAccounts.length];
    commentIndexMap.set(comment.index, i);
    commentAuthorMap.set(comment.index, commenter.id);
    commentContentMap.set(comment.index, comment.content);
  });

  const sequenceId = `modify_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let orderIndex = 0;
  let commentCount = 0;
  let replyCount = 0;
  let cumulativeDelay = FIRST_COMMENT_DELAY;
  const lastReplyerByParent = new Map<number, string>();

  for (const item of comments) {
    const itemDelay = cumulativeDelay;

    if (item.type === "comment") {
      const commenterId = commentAuthorMap.get(item.index);
      if (!commenterId) continue;

      const commentJobData: CommentJobData = {
        type: "comment",
        accountId: commenterId,
        userId,
        cafeId,
        articleId,
        content: item.content,
        commentIndex: commentIndexMap.get(item.index),
        keyword,
        sequenceId,
        sequenceIndex: orderIndex,
      };

      await addTaskJob(commenterId, commentJobData, itemDelay);
      console.log(
        `    댓글 Job: ${commenterId} (${Math.round(itemDelay / 1000)}초 후)`,
      );
      commentCount++;
      orderIndex++;
      cumulativeDelay += getRandomDelay(BETWEEN_COMMENTS_DELAY);
      continue;
    }

    if (item.parentIndex === undefined) continue;

    const parentCommentOrder = commentIndexMap.get(item.parentIndex);
    if (parentCommentOrder === undefined) continue;

    const parentCommenterId = commentAuthorMap.get(item.parentIndex);

    let replyerAccountId: string;
    if (item.type === "author_reply") {
      replyerAccountId = writerAccountId;
    } else if (item.type === "commenter_reply") {
      replyerAccountId =
        parentCommenterId ||
        commenterAccounts[parentCommentOrder % commenterAccounts.length].id;
    } else {
      const excludeIds = new Set<string>();
      if (parentCommenterId) excludeIds.add(parentCommenterId);
      const lastReplyer = lastReplyerByParent.get(item.parentIndex);
      if (lastReplyer) excludeIds.add(lastReplyer);
      const available = commenterAccounts.filter(
        (a) => !excludeIds.has(a.id),
      );
      replyerAccountId =
        available.length > 0
          ? available[Math.floor(Math.random() * available.length)].id
          : commenterAccounts[
              Math.floor(Math.random() * commenterAccounts.length)
            ].id;
    }

    lastReplyerByParent.set(item.parentIndex, replyerAccountId);

    const replyJobData: ReplyJobData = {
      type: "reply",
      accountId: replyerAccountId,
      userId,
      cafeId,
      articleId,
      content: item.content,
      commentIndex: parentCommentOrder,
      parentComment: commentContentMap.get(item.parentIndex),
      parentNickname: parentCommenterId
        ? accountNicknameMap.get(parentCommenterId)
        : undefined,
      keyword,
      sequenceId,
      sequenceIndex: orderIndex,
    };

    await addTaskJob(replyerAccountId, replyJobData, itemDelay);
    console.log(
      `    대댓글 Job (${item.type}): ${replyerAccountId} (${Math.round(itemDelay / 1000)}초 후)`,
    );
    replyCount++;
    orderIndex++;
    cumulativeDelay += getRandomDelay(BETWEEN_COMMENTS_DELAY);
  }

  return { comments: commentCount, replies: replyCount };
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");

  const manuscripts: Manuscript[] = JSON.parse(
    readFileSync(MANUSCRIPTS_FILE, "utf-8"),
  );
  console.log(`원고 ${manuscripts.length}개 로드\n`);

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({
    loginId: LOGIN_ID,
    isActive: true,
  }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  const commenterIds = accounts
    .filter((a) => a.role === "commenter")
    .map((a) => a.accountId);

  console.log(`=== 글 수정 + 댓글큐 등록 시작 (${manuscripts.length}건) ===\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < manuscripts.length; i++) {
    const ms = manuscripts[i];
    console.log(`[${i + 1}/${manuscripts.length}] #${ms.articleId} "${ms.keyword}"`);

    // 파싱
    const parsedContent = parseViralResponse(ms.raw);
    const title = parsedContent?.title || parseTitle(ms.raw);
    const body = parsedContent?.body || parseBody(ms.raw);

    if (!title || !body) {
      console.log(`  ❌ 파싱 실패`);
      failCount++;
      continue;
    }

    console.log(`  파싱 OK: "${title.slice(0, 30)}"`);

    // DB에서 작성자 조회
    const publishedArticle = await PublishedArticle.findOne({
      cafeId: CAFE_ID,
      articleId: ms.articleId,
    }).lean();

    if (!publishedArticle) {
      console.log(`  ❌ DB에 글 정보 없음`);
      failCount++;
      continue;
    }

    const writerAccountId = publishedArticle.writerAccountId;
    const account = accountMap.get(writerAccountId);
    if (!account) {
      console.log(`  ❌ 계정 정보 없음: ${writerAccountId}`);
      failCount++;
      continue;
    }

    // 글 수정
    const naverAccount: NaverAccount = {
      id: account.accountId,
      password: account.password,
      nickname: account.nickname,
    };

    if (FORCE_RELOGIN) {
      await closeContextForAccount(writerAccountId);
      invalidateLoginCache(writerAccountId);
      console.log(`  강제 재로그인 준비: ${writerAccountId}`);
    }

    process.stdout.write(`  글 수정 중... `);
    const modifyResult = await modifyArticleWithAccount(naverAccount, {
      cafeId: CAFE_ID,
      articleId: ms.articleId,
      newTitle: title,
      newContent: body,
      category: CAFE_ID === "25460974" ? CHANEL_MODIFY_CATEGORY : undefined,
      enableComments: true,
    });

    if (!modifyResult.success) {
      console.log(`❌ ${modifyResult.error}`);
      failCount++;
      continue;
    }

    console.log(`✅ 수정 완료`);

    // DB 상태 업데이트
    await PublishedArticle.updateOne(
      { cafeId: CAFE_ID, articleId: ms.articleId },
      {
        $set: {
          status: "modified",
          title,
          content: body,
          keyword: ms.keyword,
        },
      },
    );

    // 댓글큐 등록
    const viralComments: ViralCommentsData | undefined = parsedContent
      ?.comments?.length
      ? { comments: parsedContent.comments }
      : undefined;

    if (viralComments) {
      const allNaverAccounts: NaverAccount[] = accounts.map((a) => ({
        id: a.accountId,
        password: a.password,
        nickname: a.nickname,
      }));
      const commenterAccounts = allNaverAccounts.filter(
        (a) => commenterIds.includes(a.id) && a.id !== writerAccountId,
      );

      const { comments, replies } = await addViralCommentJobs(
        ms.articleId,
        CAFE_ID,
        ms.keyword,
        writerAccountId,
        user.userId,
        viralComments,
        commenterAccounts,
        allNaverAccounts,
      );
      console.log(`  댓글 ${comments}개 + 대댓글 ${replies}개 큐 추가`);
    }

    successCount++;

    if (i < manuscripts.length - 1) {
      console.log(`  ⏳ ${DELAY_BETWEEN_MODIFY_MS / 1000}초 대기...\n`);
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MODIFY_MS));
    }
  }

  console.log(`\n=== 완료: 성공 ${successCount}건 / 실패 ${failCount}건 ===`);
};

main()
  .then(async () => {
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("run-modify-from-manuscripts failed:", e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
