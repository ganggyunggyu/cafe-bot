import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
  closeAllContexts,
} from "../src/shared/lib/multi-session";
import mongoose from "mongoose";
import { Account } from "../src/shared/models/account";

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const acc = await Account.findOne({ accountId: "angrykoala270" }).lean();
  await acquireAccountLock("angrykoala270");
  try {
    const li = await isAccountLoggedIn("angrykoala270");
    if (!li) await loginAccount("angrykoala270", acc!.password);
    const page = await getPageForAccount("angrykoala270");
    await page.goto("https://cafe.naver.com/ca-fe/cafes/25729954/articles/11258063", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    // Try various selectors
    const sels = [".CommentItem", ".comment_item", "li.comment", ".comment-area li", "[class*=Comment]", ".u_cbox_comment"];
    for (const s of sels) {
      const cnt = await page.locator(s).count();
      console.log(s + ": " + cnt + "개");
    }

    // Iframe?
    const frames = page.frames();
    console.log("frames:", frames.length);
    for (const f of frames) {
      console.log("  frame url:", f.url().slice(0, 100));
    }

    // Inner page structure
    const html = await page.content();
    const commentSnippet = html.match(/한 달 정도[^<]{0,80}/);
    console.log("\nHTML 컨텍스트 (한 달 정도 검색):");
    console.log(commentSnippet?.[0] || "없음");

    // Check for cafe-main iframe
    const cafeFrame = frames.find(f => f.url().includes("cafe.naver.com") && f.url() !== page.url());
    if (cafeFrame) {
      console.log("\n=== iframe 내부 ===");
      for (const s of sels) {
        const cnt = await cafeFrame.locator(s).count();
        console.log(s + ": " + cnt + "개");
      }
    }
  } finally {
    releaseAccountLock("angrykoala270");
    await closeAllContexts();
    await mongoose.disconnect();
  }
};
main().then(() => process.exit(0)).catch(async e => { console.error(e); try { await closeAllContexts(); } catch {} process.exit(1); });
