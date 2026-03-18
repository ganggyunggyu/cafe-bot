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

  let totalOk = 0;
  let totalWarn = 0;
  let totalFail = 0;

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

      // 댓글 분류
      const comments = (a.comments || []).filter((c) => c.type === "comment");
      const replies = (a.comments || []).filter((c) => c.type === "reply");

      // 상태 판정
      const hasArticle = a.articleId > 0 && urlOk;
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

      const commenters = comments.map((c) => c.accountId).join(", ");
      const repliers = replies.map((c) => c.accountId).join(", ");

      console.log(
        `  [${status}] ${time} | ${a.writerAccountId} | "${a.keyword}"`,
      );
      console.log(
        `    #${a.articleId} | 댓글 ${comments.length}건 | 대댓글 ${replies.length}건`,
      );
      if (commenters) console.log(`    댓글: ${commenters}`);
      if (repliers) console.log(`    대댓글: ${repliers}`);
      if (!urlOk && a.articleId > 0)
        console.log(`    URL 응답 없음: ${url}`);
    }
  }

  console.log(`\n=== 검증 결과 ===`);
  console.log(`OK: ${totalOk}건 | WARN: ${totalWarn}건 | FAIL: ${totalFail}건`);
  console.log(`총 ${articles.length}건 중 ${totalOk}건 완전 정상\n`);

  await mongoose.disconnect();
};

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
