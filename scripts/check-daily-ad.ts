/**
 * 댓글 차단(daily-ad) 글 조회 스크립트
 *
 * 카페별 writer 계정이 작성한 글 중 댓글이 차단된(isWriteComment: false) 글을 찾아 링크를 출력합니다.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/check-daily-ad.ts [cafeId]
 *
 * Examples:
 *   npx tsx --env-file=.env.local scripts/check-daily-ad.ts              # 샤넬오픈런 (기본)
 *   npx tsx --env-file=.env.local scripts/check-daily-ad.ts 25729954     # 쇼핑지름신
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models/published-article";
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";

const CAFE_MAP: Record<string, string> = {
  "25460974": "샤넬오픈런",
  "25729954": "쇼핑지름신",
  "25636798": "건강한노후준비",
  "25227349": "건강관리소",
};

const main = async (): Promise<void> => {
  const cafeId = process.argv[2] || "25460974";
  const cafeName = CAFE_MAP[cafeId] || cafeId;

  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const writerIds = accounts
    .filter((a) => a.role === "writer")
    .map((a) => a.accountId);
  const commenterAccounts = accounts.filter((a) => a.role === "commenter");

  // 댓글 체크용 계정 (commenter 중 첫 번째)
  const checker = commenterAccounts[0];
  if (!checker) throw new Error("commenter 계정 없음");

  // DB에서 published 글 조회
  const articles = await PublishedArticle.find({
    cafeId,
    writerAccountId: { $in: writerIds },
    status: "published",
  })
    .sort({ publishedAt: -1 })
    .lean();

  if (articles.length === 0) {
    console.log(`${cafeName}: published 글 0건`);
    return;
  }

  console.log(`${cafeName}: published 글 ${articles.length}건 체크 중...\n`);

  // 브라우저 로그인
  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(checker.accountId, checker.password);
      if (!loginResult.success) throw new Error(`로그인 실패: ${loginResult.error}`);
    }

    const page = await getPageForAccount(checker.accountId);
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${cafeId}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    const commentDisabled: typeof articles = [];

    for (const article of articles) {
      const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${cafeId}/articles/${article.articleId}?useCafeId=true`;

      const result = await page.evaluate(async (url: string) => {
        try {
          const res = await fetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) return { error: `HTTP ${res.status}` };
          return await res.json();
        } catch (e) {
          return { error: String(e) };
        }
      }, apiUrl);

      if (result.error) {
        console.log(`  ❌ #${article.articleId} API 오류: ${result.error}`);
        continue;
      }

      const isWriteComment = result?.result?.article?.isWriteComment;
      if (isWriteComment === false) {
        commentDisabled.push(article);
      }
    }

    await saveCookiesForAccount(checker.accountId);

    // 결과 출력
    console.log(`=== ${cafeName} 댓글 차단(daily-ad) ${commentDisabled.length}건 ===\n`);

    if (commentDisabled.length === 0) {
      console.log("댓글 차단 글 없음");
      return;
    }

    // 날짜별 그룹핑
    const grouped = new Map<string, typeof articles>();
    for (const a of commentDisabled) {
      const date = a.publishedAt ? new Date(a.publishedAt) : new Date();
      const key = `${date.getMonth() + 1}/${date.getDate()}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }

    for (const [dateStr, posts] of grouped) {
      console.log(`### ${dateStr} (${posts.length}건)`);
      for (const a of posts) {
        console.log(`- ${a.keyword} → ${a.articleUrl}`);
      }
      console.log();
    }
  } finally {
    releaseAccountLock(checker.accountId);
  }
};

main()
  .then(async () => {
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("check-daily-ad failed:", e);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
