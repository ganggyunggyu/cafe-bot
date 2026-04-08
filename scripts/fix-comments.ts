import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = "25460974";
const ARTICLE_ID = 289308;

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) throw new Error("user not found");
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const checker = accounts.find((a) => a.accountId === "8i2vlbym")!;
  const writer = accounts.find((a) => a.accountId === "uqgidh2690")!;
  const commenter = accounts.find((a) => a.accountId === "0ehz3cb2")!;

  // 8i2vlbym으로 댓글 조회 + 삭제/추가 (브라우저 내 fetch)
  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const r = await loginAccount(checker.accountId, checker.password);
      if (!r.success) throw new Error(`로그인 실패: ${r.error}`);
    }

    const page = await getPageForAccount(checker.accountId);

    // 카페 글 페이지로 이동 (fetch 기반 API를 위한 오리진 세팅)
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}`, {
      waitUntil: "domcontentloaded", timeout: 15000,
    });
    await page.waitForTimeout(2000);

    // 댓글 API (브라우저 내)
    console.log("=== 댓글 조회 ===\n");
    const commentsResult = await page.evaluate(async (args: { cafeId: string; articleId: number }) => {
      const url = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${args.cafeId}/articles/${args.articleId}/comments/pages/1?orderBy=asc&pageSize=100&requestFrom=A`;
      const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) return { error: `${res.status}: ${await res.text().catch(() => "")}` };
      return res.json();
    }, { cafeId: CAFE_ID, articleId: ARTICLE_ID });

    if (commentsResult.error) {
      console.log("댓글 API 오류:", commentsResult.error);
      await saveCookiesForAccount(checker.accountId);
      return;
    }

    const comments = commentsResult?.result?.comments?.items || [];
    console.log(`댓글 ${comments.length}개\n`);

    for (const c of comments) {
      const nick = c.writer?.nick || "?";
      const content = (c.content || "").slice(0, 70);
      const ref = c.refComment ? "  ↳ " : "";
      console.log(`${ref}[${c.commentId}] ${nick}: ${content}`);
    }

    await saveCookiesForAccount(checker.accountId);
  } finally {
    releaseAccountLock(checker.accountId);
  }
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error(e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
