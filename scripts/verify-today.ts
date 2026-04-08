/**
 * 오늘 발행된 글의 게시글/댓글/대댓글 검증 스크립트
 * - DB에서 오늘 발행 글 조회
 * - curl로 URL 200 체크 (게시글 존재 확인)
 * - 댓글/대댓글 기록 검증
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-today.ts
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

const CAFE_NAMES: Record<string, string> = {
  "25729954": "쇼핑지름신",
  "25460974": "샤넬오픈런",
  "25227349": "건강관리소",
  "25636798": "건강한노후준비",
};

interface ArticleComment {
  accountId: string;
  nickname: string;
  content: string;
  type: "comment" | "reply";
  parentIndex?: number;
  createdAt: Date;
}

interface PublishedArticle {
  articleId: number;
  cafeId: string;
  keyword: string;
  title: string;
  articleUrl: string;
  writerAccountId: string;
  publishedAt: Date;
  commentCount: number;
  replyCount: number;
  comments: ArticleComment[];
  category?: string;
}

import {
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
} from "../src/shared/lib/multi-session";

const checkUrlAlive = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
};

interface CafeArticleDetail {
  exists: boolean;
  menuName?: string;
  commentCount?: number;
  title?: string;
  error?: string;
}

// 실제 카페 API로 글 상세 조회 (카테고리/댓글 수 검증)
const fetchArticleDetail = async (
  page: import("playwright").Page,
  cafeId: string,
  articleId: number,
): Promise<CafeArticleDetail> => {
  const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${cafeId}/articles/${articleId}?useCafeId=true`;
  const result = await page.evaluate(async (url: string) => {
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const data = await res.json();
      const article = data?.result?.article;
      if (!article) return { error: "article null" };
      return {
        menuName: article.menu?.name || null,
        commentCount: article.commentCount ?? 0,
        title: article.subject || null,
      };
    } catch (e) {
      return { error: String(e) };
    }
  }, apiUrl);

  if (result.error) return { exists: false, error: result.error };
  return { exists: true, ...result };
};

const EXPECTED_CATEGORIES: Record<string, Record<string, string>> = {
  "25729954": { ad: "일반 쇼핑후기", daily: "일상톡톡" },
  "25460974": { ad: "일상샤반사", daily: "일상샤반사", "daily-ad": "일상샤반사" },
};

const main = async () => {
  if (MONGODB_URI == null) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (db == null) throw new Error("db null");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const articles = (await db
    .collection("publishedarticles")
    .find({ publishedAt: { $gte: today } })
    .sort({ publishedAt: 1 })
    .toArray()) as unknown as PublishedArticle[];

  console.log(`\n=== 오늘 발행 글 검증 (${articles.length}건) ===\n`);

  // 실제 카페 API 검증을 위한 Playwright 세션 준비
  const Account = (await import("../src/shared/models/account")).Account;
  const User = (await import("../src/shared/models/user")).User;
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  const accounts = user
    ? await Account.find({ userId: user.userId, isActive: true }).lean()
    : [];
  const firstAccount = accounts[0];

  let browserPage: import("playwright").Page | null = null;
  if (firstAccount) {
    const loggedIn = await isAccountLoggedIn(firstAccount.accountId);
    if (!loggedIn) {
      await loginAccount(firstAccount.accountId, firstAccount.password);
    }
    browserPage = await getPageForAccount(firstAccount.accountId);
    // 카페 방문해서 쿠키 활성화
    await browserPage.goto(`https://cafe.naver.com/ca-fe/cafes/${articles[0]?.cafeId || "25729954"}`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await browserPage.waitForTimeout(1000);
  }

  let totalOk = 0;
  let totalWarn = 0;
  let totalFail = 0;
  let categoryMismatch = 0;

  const byCafe: Record<string, PublishedArticle[]> = {};
  for (const a of articles) {
    const key = a.cafeId;
    if (byCafe[key] == null) byCafe[key] = [];
    byCafe[key].push(a);
  }

  for (const [cafeId, arts] of Object.entries(byCafe)) {
    const cafeName = CAFE_NAMES[cafeId] || cafeId;
    console.log(`\n── ${cafeName} (${arts.length}건) ──`);

    for (const a of arts) {
      const time = new Date(a.publishedAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // 게시글 URL 체크
      const url = `https://cafe.naver.com/ca-fe/cafes/${a.cafeId}/articles/${a.articleId}`;
      const urlOk = await checkUrlAlive(url);

      // 실제 카페 API로 카테고리 + 댓글 수 검증
      let cafeDetail: CafeArticleDetail = { exists: false };
      if (browserPage && a.articleId > 0) {
        cafeDetail = await fetchArticleDetail(browserPage, a.cafeId, a.articleId);
      }

      // 카테고리 일치 확인
      const expected = EXPECTED_CATEGORIES[cafeId];
      const postType = (a as any).postType || "ad";
      const expectedCat = expected?.[postType];
      const actualCat = cafeDetail.menuName;
      const catMatch = !expectedCat || !actualCat || actualCat.includes(expectedCat) || expectedCat.includes(actualCat);
      if (!catMatch) categoryMismatch++;

      // 댓글 분류
      const comments = (a.comments || []).filter((c) => c.type === "comment");
      const replies = (a.comments || []).filter((c) => c.type === "reply");
      const apiComments = cafeDetail.commentCount ?? 0;

      // 상태 판정
      const hasArticle = a.articleId > 0 && (urlOk || cafeDetail.exists);
      const hasComments = comments.length > 0;
      const hasReplies = replies.length > 0;

      let status: string;
      if (hasArticle && hasComments && hasReplies) {
        status = "OK";
        totalOk++;
      } else if (hasArticle && hasComments) {
        status = "WARN (대댓글 없음)";
        totalWarn++;
      } else if (hasArticle) {
        status = "WARN (댓글 없음)";
        totalWarn++;
      } else {
        status = "FAIL (게시글 없음)";
        totalFail++;
      }

      const catInfo = actualCat ? `[${actualCat}]` : "";
      const catFlag = !catMatch ? " ❌카테고리불일치" : "";
      const commentFlag = apiComments > 0 && comments.length === 0 ? " (API댓글:" + apiComments + ")" : "";

      console.log(
        `  [${status}] ${time} | ${a.writerAccountId} | "${a.keyword}"`,
      );
      console.log(
        `    #${a.articleId} | DB댓글 ${comments.length}+${replies.length} | 카페댓글 ${apiComments} | ${catInfo}${catFlag}${commentFlag}`,
      );
      if (!urlOk && a.articleId > 0 && !cafeDetail.exists)
        console.log(`    URL 응답 없음: ${url}`);
    }
  }

  console.log(`\n=== 검증 결과 ===`);
  console.log(`OK: ${totalOk}건 | WARN: ${totalWarn}건 | FAIL: ${totalFail}건`);
  console.log(`카테고리 불일치: ${categoryMismatch}건`);
  console.log(`총 ${articles.length}건 중 ${totalOk}건 완전 정상\n`);

  await mongoose.disconnect();
};

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
