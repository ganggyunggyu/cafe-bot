/**
 * laghunter8 가입 흐름 단계별 깊은 진단
 */
import mongoose from "mongoose";
import { Account } from "../src/shared/models/account";
import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
  closeAllContexts,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const ACCOUNT_ID = "laghunter8";
const CAFE = { name: "쇼핑지름신", cafeId: "25729954" };

const main = async (): Promise<void> => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const acc = await Account.findOne({ accountId: ACCOUNT_ID }).lean();
  if (!acc) throw new Error("계정 없음");

  await acquireAccountLock(ACCOUNT_ID);
  try {
    const loggedIn = await isAccountLoggedIn(ACCOUNT_ID);
    if (!loggedIn) {
      await loginAccount(ACCOUNT_ID, acc.password);
    }
    const page = await getPageForAccount(ACCOUNT_ID);

    page.on("dialog", async (d: any) => {
      console.log("DIALOG:", d.message());
      try { await d.dismiss(); } catch {}
    });
    page.on("popup", async (p: any) => {
      console.log("POPUP URL:", p.url());
    });
    page.on("framenavigated", (frame: any) => {
      if (frame === page.mainFrame()) console.log("NAV:", frame.url());
    });

    const cafeUrl = `https://m.cafe.naver.com/ca-fe/web/cafes/${CAFE.cafeId}`;
    console.log("\n--- STEP 1: 카페 진입 ---");
    await page.goto(cafeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log("URL:", page.url());

    console.log("\n--- STEP 2: 가입 버튼 정보 ---");
    const joinBtns = await page.$$('button, a');
    for (const b of joinBtns) {
      const t = await b.evaluate((n: any) => (n.textContent || "").trim());
      const href = await b.evaluate((n: any) => n.href || "").catch(() => "");
      const onclick = await b.evaluate((n: any) => n.getAttribute("onclick") || "");
      if (t.includes("가입") && t.length < 30) {
        console.log(`  [BTN] "${t}" href="${href.slice(0,80)}" onclick="${onclick.slice(0,80)}"`);
      }
    }

    console.log("\n--- STEP 3: 가입 버튼 클릭 ---");
    const joinClicked = await page.locator('button:has-text("카페 가입하기"), a:has-text("카페 가입하기"), button:has-text("가입하기"), a:has-text("가입하기")').first().click({ timeout: 5000 }).then(() => true).catch((e: any) => { console.log("클릭 에러:", e.message); return false; });
    console.log("clicked:", joinClicked);
    await page.waitForTimeout(4000);

    console.log("\n--- STEP 4: 클릭 후 상태 ---");
    console.log("URL:", page.url());
    const titleNow = await page.title();
    console.log("title:", titleNow);

    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log("body text:");
    console.log(bodyText);

    console.log("\n--- STEP 5: 입력 필드들 ---");
    const inputs = await page.$$('input:visible, textarea:visible, select:visible');
    console.log(`총 ${inputs.length}개 visible input`);
    for (const inp of inputs) {
      const info = await inp.evaluate((el: any) => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        value: el.value,
        label: el.labels?.[0]?.textContent?.trim() || "",
      }));
      console.log("  ", JSON.stringify(info));
    }

    console.log("\n--- STEP 6: 모든 button/a 요소 (가시성/텍스트) ---");
    const allClickables = await page.$$('button, a[role="button"], input[type="submit"], input[type="button"]');
    let printed = 0;
    for (const el of allClickables) {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const t = await el.evaluate((n: any) => (n.textContent || n.value || "").trim());
      if (!t || t.length > 30) continue;
      console.log(`  [BTN] "${t}"`);
      printed++;
      if (printed > 30) break;
    }

  } finally {
    releaseAccountLock(ACCOUNT_ID);
    await closeAllContexts();
    await mongoose.disconnect();
  }
};

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
