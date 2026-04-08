import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import {
  getPageForAccount, saveCookiesForAccount, isAccountLoggedIn,
  loginAccount, acquireAccountLock, releaseAccountLock,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = "25460974";
const ARTICLE_ID = 290137;

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) throw new Error("user not found");
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const checker = accounts.find((a) => a.accountId === "8i2vlbym")!;

  await acquireAccountLock(checker.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(checker.accountId);
    if (!loggedIn) {
      const r = await loginAccount(checker.accountId, checker.password);
      if (!r.success) throw new Error(`로그인 실패: ${r.error}`);
    }
    const page = await getPageForAccount(checker.accountId);
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}`, {
      waitUntil: "domcontentloaded", timeout: 15000,
    });
    await page.waitForTimeout(1000);

    const apiUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${CAFE_ID}/articles/${ARTICLE_ID}?useCafeId=true`;
    const result = await page.evaluate(async (url: string) => {
      const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (!res.ok) return { error: res.status };
      return res.json();
    }, apiUrl);

    if (result.error) { console.log("API 오류:", result.error); return; }

    const article = result?.result?.article;
    console.log(`제목: ${article?.subject}`);
    console.log(`isWriteComment: ${article?.isWriteComment}`);
    console.log(`commentCount: ${article?.commentCount}`);

    await saveCookiesForAccount(checker.accountId);
  } finally {
    releaseAccountLock(checker.accountId);
  }
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error(e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
