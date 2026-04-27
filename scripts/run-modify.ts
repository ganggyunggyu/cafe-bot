/**
 * 글 수정 스크립트 (일상광고 → 광고 전환)
 *
 * 카페 링크 + 키워드 쌍을 받아서:
 * 1. 링크에서 cafeId/articleId 파싱
 * 2. DB에서 writer 계정 조회
 * 3. 새 광고 원고 생성
 * 4. 글 수정 + 댓글 허용
 * 5. 바이럴 댓글 큐 추가
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-modify.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { readFileSync } from "fs";
import mongoose from "mongoose";
import { google } from "googleapis";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models";
import { modifyArticleWithAccount } from "../src/features/auto-comment/batch/article-modifier";
import { generateViralContent } from "../src/shared/api/content-api";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildCompetitorAdvocacyPrompt } from "../src/features/viral/prompts/build-competitor-advocacy-prompt";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import { addTaskJob } from "../src/shared/lib/queue";
import {
  acquireAccountLock,
  closeContextForAccount,
  invalidateLoginCache,
  loginAccount,
  releaseAccountLock,
} from "../src/shared/lib/multi-session";
import type {
  CommentJobData,
  ReplyJobData,
  ViralCommentsData,
} from "../src/shared/lib/queue/types";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";

const SHEET_SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const SHEET_TAB = "카페키워드";

const CAFE_NAME_MAP: Record<string, string> = {
  "25460974": "샤넬오픈런",
  "25729954": "쇼핑지름신",
  "25636798": "건강한노후준비",
  "25227349": "건강관리소",
};

const appendKeywordToSheet = async (
  cafeName: string,
  keyword: string,
): Promise<void> => {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const today = new Date().toISOString().slice(0, 10);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_SPREADSHEET_ID,
      range: `${SHEET_TAB}!A:D`,
      valueInputOption: "RAW",
      requestBody: { values: [[cafeName, keyword, today, 1]] },
    });
    console.log(`  📝 시트 기록: ${keyword}`);
  } catch (e) {
    console.log(`  ⚠️ 시트 기록 실패: ${e instanceof Error ? e.message : e}`);
  }
};

interface ModifyItem {
  link: string;
  keyword: string;
  keywordType?: 'own' | 'competitor';
  category?: string;
}

const DELAY_BETWEEN_MS = parseInt(process.env.MODIFY_DELAY_MS || "", 10) || 15 * 60 * 1000; // 기본 15분
const TARGET_ARTICLE_IDS = (process.env.ARTICLE_IDS || "")
  .split(",")
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const MODIFY_SCHEDULE_FILE = process.env.MODIFY_SCHEDULE_FILE || "";
const CHANEL_MODIFY_CATEGORY = "_ 일상샤반사 📆";
const MODIFY_PRIMARY_MODEL = process.env.MODIFY_PRIMARY_MODEL || "";
const MODIFY_OVERLOAD_FALLBACK_MODEL =
  process.env.MODIFY_OVERLOAD_FALLBACK_MODEL || "gemini-3.1-pro-preview";
const MODIFY_FORCE_RELOGIN = process.env.MODIFY_FORCE_RELOGIN === "true";

const MODIFY_SCHEDULE: ModifyItem[] = [
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293152", keyword: "제주산 당찬여주 발효효소", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293486", keyword: "다이어트 유산균 비에날씬", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293490", keyword: "베지밀", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293504", keyword: "갱년기유산균YT1 메노락토 오리진", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293512", keyword: "제주산 당찬여주 발효효소_체험분", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293585", keyword: "카무트 영양견과바", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293681", keyword: "미녀의 석류 콜라겐", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
  { link: "https://cafe.naver.com/ca-fe/cafes/25460974/articles/293693", keyword: "정관장 홍삼활력플러스업", keywordType: "competitor", category: CHANEL_MODIFY_CATEGORY },
];

const getModifySchedule = (): ModifyItem[] => {
  const scheduleFromFile = (() => {
    if (!MODIFY_SCHEDULE_FILE) {
      return null;
    }

    const raw = readFileSync(MODIFY_SCHEDULE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("MODIFY_SCHEDULE_FILE must be a JSON array");
    }

    return parsed as ModifyItem[];
  })();

  const baseSchedule = scheduleFromFile ?? MODIFY_SCHEDULE;

  if (TARGET_ARTICLE_IDS.length === 0) {
    return baseSchedule;
  }

  return baseSchedule.filter((item) => {
    const parsed = parseCafeLink(item.link);
    if (!parsed) return false;
    return TARGET_ARTICLE_IDS.includes(parsed.articleId);
  });
};

// 카페 링크에서 cafeId + articleId 파싱
const parseCafeLink = (
  link: string,
): { cafeId: string; articleId: number } | null => {
  // 형식 1: iframe_url_utf8 파라미터
  const iframeMatch = link.match(/clubid[=:](\d+)/i);
  const articleIdFromIframe = link.match(/articleid[=:](\d+)/i);
  if (iframeMatch && articleIdFromIframe) {
    return {
      cafeId: iframeMatch[1],
      articleId: parseInt(articleIdFromIframe[1], 10),
    };
  }

  // 형식 2: /ca-fe/cafes/{cafeId}/articles/{articleId}
  const cafeApiMatch = link.match(/cafes\/(\d+)\/articles\/(\d+)/);
  if (cafeApiMatch) {
    return {
      cafeId: cafeApiMatch[1],
      articleId: parseInt(cafeApiMatch[2], 10),
    };
  }

  // 형식 3: URL 디코딩 후 재시도
  try {
    const decoded = decodeURIComponent(decodeURIComponent(link));
    const decodedIframe = decoded.match(/clubid=(\d+)/i);
    const decodedArticle = decoded.match(/articleid=(\d+)/i);
    if (decodedIframe && decodedArticle) {
      return {
        cafeId: decodedIframe[1],
        articleId: parseInt(decodedArticle[1], 10),
      };
    }
  } catch {}

  return null;
};

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

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const forceReloginBeforeModify = async (
  accountId: string,
  password: string,
  articleId: number,
): Promise<void> => {
  let lastError = "수정 전 재로그인 실패";

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`  수정 전 재로그인: ${accountId} (${attempt}/3)`);
    await closeContextForAccount(accountId).catch(() => {});
    invalidateLoginCache(accountId);
    await sleep(1000 * attempt);

    await acquireAccountLock(accountId);
    try {
      const loginResult = await loginAccount(accountId, password, {
        waitForLoginMs: 3 * 60 * 1000,
        reason: `modify_force_relogin_${articleId}`,
        forceFreshLogin: true,
      });

      if (loginResult.success) {
        return;
      }

      lastError = loginResult.error || lastError;
    } finally {
      releaseAccountLock(accountId);
    }
  }

  throw new Error(lastError);
};

const isOverloadedError = (error: unknown): boolean => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return /529|overloaded|overloaded_error/i.test(errorMessage);
};

const generateViralContentWithRetry = async (
  prompt: string,
  maxAttempts: number = 3,
): Promise<Awaited<ReturnType<typeof generateViralContent>>> => {
  let lastError: unknown;
  let retryModel: string | undefined = MODIFY_PRIMARY_MODEL || undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await generateViralContent({ prompt, model: retryModel });
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ⚠️ 원고 생성 실패 (${attempt}/${maxAttempts}): ${errorMessage}`);

      if (isOverloadedError(error) && MODIFY_OVERLOAD_FALLBACK_MODEL && MODIFY_OVERLOAD_FALLBACK_MODEL !== retryModel) {
        retryModel = MODIFY_OVERLOAD_FALLBACK_MODEL;
        console.log(
          `  ↪ 529 과부하 감지, 다음 시도부터 ${retryModel} 사용`,
        );
      }

      if (attempt < maxAttempts) {
        await sleep(3000 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

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
  const modifySchedule = getModifySchedule();

  if (modifySchedule.length === 0) {
    console.log("MODIFY_SCHEDULE이 비어있음");
    return;
  }

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

  console.log(`=== 글 수정 시작 (${modifySchedule.length}건) ===\n`);

  let successCount = 0;
  let failCount = 0;

  for (const item of modifySchedule) {
    const parsed = parseCafeLink(item.link);
    if (!parsed) {
      console.log(`❌ 링크 파싱 실패: ${item.link}`);
      failCount++;
      continue;
    }

    const { cafeId, articleId } = parsed;
    console.log(
      `[${articleId}] "${item.keyword}" (cafeId: ${cafeId})`,
    );

    // DB에서 작성자 조회
    const publishedArticle = await PublishedArticle.findOne({
      cafeId,
      articleId,
    }).lean();
    if (!publishedArticle) {
      console.log(`  ❌ DB에 글 정보 없음 (articleId: ${articleId})`);
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

    console.log(`  작성자: ${writerAccountId}`);

    // 광고 원고 생성
    try {
      const kType = item.keywordType || "own";
      const prompt = kType === "competitor"
        ? buildCompetitorAdvocacyPrompt({ keyword: item.keyword, keywordType: "competitor" })
        : buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: "own" });

      process.stdout.write(`  원고 생성 중... `);
      const { content } = await generateViralContentWithRetry(prompt);
      const parsedContent = parseViralResponse(content);
      const title = parsedContent?.title || parseTitle(content);
      const body = parsedContent?.body || parseBody(content);
      if (!title || !body) throw new Error("파싱 실패");

      console.log(`✅ "${title.slice(0, 30)}..."`);

      // 글 수정
      const naverAccount: NaverAccount = {
        id: account.accountId,
        password: account.password,
        nickname: account.nickname,
      };

      if (MODIFY_FORCE_RELOGIN) {
        await forceReloginBeforeModify(
          writerAccountId,
          account.password,
          articleId,
        );
      }

      process.stdout.write(`  글 수정 중... `);
      const modifyResult = await modifyArticleWithAccount(naverAccount, {
        cafeId,
        articleId,
        newTitle: title,
        newContent: body,
        category: item.category || (cafeId === "25460974" ? CHANEL_MODIFY_CATEGORY : undefined),
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
        { cafeId, articleId },
        {
          $set: {
            status: "modified",
            title,
            content: body,
            keyword: item.keyword,
          },
        },
      );

      // 바이럴 댓글 큐 추가
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
          articleId,
          cafeId,
          item.keyword,
          writerAccountId,
          user.userId,
          viralComments,
          commenterAccounts,
          allNaverAccounts,
        );
        console.log(`  댓글 ${comments}개 + 대댓글 ${replies}개 큐 추가`);
      }

      // 시트에 키워드 기록 (샤넬/쇼핑만, 건강카페 제외)
      const cafeName = CAFE_NAME_MAP[cafeId];
      if (cafeName && !cafeName.includes("건강")) {
        await appendKeywordToSheet(cafeName, item.keyword);
      }

      successCount++;
    } catch (e) {
      console.log(`  ❌ ${e instanceof Error ? e.message : e}`);
      failCount++;
    }

    console.log("");

    // 다음 글까지 딜레이 (마지막 글 제외)
    const idx = modifySchedule.indexOf(item);
    if (idx < modifySchedule.length - 1) {
      const delayMin = Math.round(DELAY_BETWEEN_MS / 60000);
      console.log(`  ⏳ 다음 글까지 ${delayMin}분 대기...\n`);
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_MS));
    }
  }

  console.log(`=== 완료: 성공 ${successCount}건 / 실패 ${failCount}건 ===`);
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("run-modify failed:", e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
