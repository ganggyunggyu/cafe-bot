/**
 * 샤넬 daily-ad 수정 검증 스크립트
 *
 * DB에서 미수정 daily-ad 글을 조회 후 실제 네이버 API로 현재 상태를 확인합니다.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-chanel-daily-ad.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models/published-article";
import {
  acquireAccountLock,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from "../src/shared/lib/multi-session";

const CAFE_ID = process.env.VERIFY_CAFE_ID || "25460974";
const LOGIN_ID = process.env.LOGIN_ID || "21lab";
const CHECKER_ACCOUNT = process.env.CHECKER_ACCOUNT || "8i2vlbym";
const PAGE_WAIT_MS = 1500;

type Verdict =
  | "UNMODIFIED"
  | "MODIFIED_DB_MISS"
  | "COMMENTS_OPEN"
  | "TITLE_CHANGED"
  | "DELETED"
  | "ERROR";

interface VerifyResult {
  articleId: number;
  date: string;
  accountId: string;
  verdict: Verdict;
  dbTitle: string;
  currentTitle: string;
  isWriteComment: boolean | null;
  commentCount: number;
}

const main = async (): Promise<void> => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();
  const checker = accounts.find((a) => a.accountId === CHECKER_ACCOUNT);
  if (!checker) throw new Error(`checker account not found: ${CHECKER_ACCOUNT}`);

  const unmodified = await PublishedArticle.find({
    cafeId: CAFE_ID,
    postType: "daily-ad",
    status: { $ne: "modified" },
  })
    .select({
      articleId: 1,
      title: 1,
      keyword: 1,
      articleUrl: 1,
      writerAccountId: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  const totalDailyAd = await PublishedArticle.countDocuments({
    cafeId: CAFE_ID,
    postType: "daily-ad",
  });
  const modifiedCount = await PublishedArticle.countDocuments({
    cafeId: CAFE_ID,
    postType: "daily-ad",
    status: "modified",
  });

  console.log(`=== 샤넬 daily-ad 수정 검증 ===`);
  console.log(
    `전체: ${totalDailyAd}건 / 수정완료: ${modifiedCount}건 / DB미수정: ${unmodified.length}건`,
  );
  console.log(`checker: ${CHECKER_ACCOUNT}\n`);

  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(
        checker.accountId,
        checker.password,
      );
      if (!loginResult.success)
        throw new Error(`login failed: ${loginResult.error}`);
    }

    const page = await getPageForAccount(checker.accountId);
    const results: VerifyResult[] = [];

    for (const article of unmodified) {
      const articleId = article.articleId;
      const dbTitle = article.title || article.keyword || "";
      const date = article.createdAt
        ? new Date(article.createdAt).toISOString().slice(0, 10)
        : "?";
      const accountId = article.writerAccountId || "";

      const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${CAFE_ID}/articles/${articleId}?useCafeId=true`;

      await page
        .goto(
          `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${articleId}`,
          { waitUntil: "domcontentloaded", timeout: 15000 },
        )
        .catch(() => {});
      await page.waitForTimeout(PAGE_WAIT_MS);

      const apiResult: Record<string, unknown> = await page.evaluate(
        async (url: string) => {
          try {
            const res = await fetch(url, {
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            if (!res.ok)
              return { ok: false, status: res.status, deleted: res.status === 404 };
            const data = await res.json();
            const a = (data as Record<string, Record<string, unknown>>)?.result
              ?.article as Record<string, unknown> | undefined;
            return {
              ok: true,
              title: (a?.subject as string) || "",
              isWriteComment: a?.isWriteComment,
              commentCount: (a?.commentCount as number) ?? 0,
            };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        },
        apiUrl,
      );

      if (!apiResult.ok) {
        const verdict: Verdict = apiResult.deleted ? "DELETED" : "ERROR";
        results.push({
          articleId,
          date,
          accountId,
          verdict,
          dbTitle,
          currentTitle: "",
          isWriteComment: null,
          commentCount: 0,
        });
        console.log(
          `${verdict}\t#${articleId}\t${date}\t${accountId}\t${dbTitle.slice(0, 35)}`,
        );
        continue;
      }

      const currentTitle = (apiResult.title as string) || "";
      const isWriteComment = apiResult.isWriteComment as boolean;
      const commentCount = (apiResult.commentCount as number) || 0;

      const titleChanged =
        currentTitle !== dbTitle && currentTitle.length > 0;
      const commentsEnabled = isWriteComment === true;

      let verdict: Verdict;
      if (titleChanged && commentsEnabled) verdict = "MODIFIED_DB_MISS";
      else if (!titleChanged && commentsEnabled) verdict = "COMMENTS_OPEN";
      else if (titleChanged && !commentsEnabled) verdict = "TITLE_CHANGED";
      else verdict = "UNMODIFIED";

      results.push({
        articleId,
        date,
        accountId,
        verdict,
        dbTitle,
        currentTitle,
        isWriteComment,
        commentCount,
      });

      console.log(
        `${verdict}\t#${articleId}\t${date}\t${accountId}\twrite=${String(isWriteComment)}\tcmt=${commentCount}\t${dbTitle.slice(0, 30)}`,
      );
    }

    await saveCookiesForAccount(checker.accountId);

    // 요약
    const counts: Record<Verdict, number> = {
      UNMODIFIED: 0,
      MODIFIED_DB_MISS: 0,
      COMMENTS_OPEN: 0,
      TITLE_CHANGED: 0,
      DELETED: 0,
      ERROR: 0,
    };
    for (const r of results) counts[r.verdict]++;

    console.log(`\n=== 요약 ===`);
    console.log(`미수정 확실: ${counts.UNMODIFIED}건`);
    console.log(`수정됨(DB미반영): ${counts.MODIFIED_DB_MISS}건`);
    console.log(`댓글만 열림: ${counts.COMMENTS_OPEN}건`);
    console.log(`제목만 변경: ${counts.TITLE_CHANGED}건`);
    console.log(`삭제됨: ${counts.DELETED}건`);
    console.log(`에러: ${counts.ERROR}건`);

    // 미수정 글 상세
    const unmodifiedResults = results.filter(
      (r) => r.verdict === "UNMODIFIED",
    );
    if (unmodifiedResults.length > 0) {
      console.log(`\n=== 미수정 글 상세 (${unmodifiedResults.length}건) ===`);
      const grouped = new Map<string, VerifyResult[]>();
      for (const r of unmodifiedResults) {
        const existing = grouped.get(r.date) || [];
        existing.push(r);
        grouped.set(r.date, existing);
      }
      for (const [date, items] of grouped) {
        console.log(`\n### ${date} (${items.length}건)`);
        for (const item of items) {
          console.log(
            `  #${item.articleId} | ${item.accountId} | ${item.dbTitle.slice(0, 40)}`,
          );
          console.log(
            `    https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${item.articleId}`,
          );
        }
      }
    }
  } finally {
    releaseAccountLock(checker.accountId);
    await mongoose.disconnect();
  }
};

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("verify-chanel-daily-ad failed:", e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
