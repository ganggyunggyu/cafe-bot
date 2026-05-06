/**
 * laghunter8: 가입 버튼 → 재로그인 페이지 → 자동 재로그인 → 가입 페이지 → 폼 작성 → 제출
 */
import mongoose from "mongoose";
import { Account } from "../src/shared/models/account";
import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
  saveCookiesForAccount,
  closeAllContexts,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const ACCOUNT_ID = "laghunter8";
const NICKNAME = "도도";

const CAFES = [
  { name: "건강관리소", cafeId: "25227349" },
  { name: "건강한노후준비", cafeId: "25636798" },
  { name: "샤넬오픈런", cafeId: "25460974" },
  { name: "쇼핑지름신", cafeId: "25729954" },
];

const handleReloginIfNeeded = async (page: any, password: string): Promise<boolean> => {
  const url = page.url();
  if (!url.includes("nidlogin.login")) return true;

  console.log("    🔐 재로그인 페이지 감지, 자동 입력 중");
  const idInput = page.locator('input#id').first();
  const pwInput = page.locator('input#pw').first();
  await idInput.fill(ACCOUNT_ID);
  await pwInput.fill(password);
  await page.waitForTimeout(500);
  await page.locator('button:has-text("로그인"), input[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  // Captcha may appear
  const captchaInput = page.locator('input[name="chptchakey"], input[name="captcha"]').first();
  if (await captchaInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    console.log("    ⚠️ 재로그인 캡차 발생 — 수동 처리 필요");
    return false;
  }

  const finalUrl = page.url();
  if (finalUrl.includes("nidlogin.login")) {
    console.log("    ❌ 재로그인 실패 (URL: " + finalUrl + ")");
    return false;
  }

  console.log("    ✅ 재로그인 성공, URL: " + finalUrl.slice(0, 80));
  return true;
};

const fillJoinForm = async (page: any, nickname: string): Promise<void> => {
  const inputs = page.locator('textarea:visible, input[type="text"]:visible, input:not([type]):visible');
  const cnt = await inputs.count();
  for (let i = 0; i < cnt; i++) {
    const c = inputs.nth(i);
    const meta = await c.evaluate((el: any) => ({
      id: el.id || "",
      name: el.name || "",
      placeholder: el.placeholder || "",
      label: el.labels?.[0]?.textContent || "",
    }));
    const meta_str = (meta.id + " " + meta.name + " " + meta.placeholder + " " + meta.label).toLowerCase();
    const isNick = meta_str.includes("nick") || meta_str.includes("별명") || meta_str.includes("닉네임");
    await c.fill(isNick ? nickname : "네 알겠습니다");
  }

  const checkboxes = page.locator('input[type="checkbox"]');
  const ccnt = await checkboxes.count();
  for (let i = 0; i < ccnt; i++) {
    const cb = checkboxes.nth(i);
    if (!(await cb.isChecked().catch(() => true))) {
      await cb.check({ force: true }).catch(() => {});
    }
  }
};

const joinOneCafe = async (page: any, cafe: { name: string; cafeId: string }, password: string): Promise<{ ok: boolean; reason: string }> => {
  const cafeUrl = `https://m.cafe.naver.com/ca-fe/web/cafes/${cafe.cafeId}`;
  await page.goto(cafeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  const writeBtn = page.locator('a:has-text("글쓰기"), a[href*="/articles/write"]').first();
  if (await writeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    return { ok: true, reason: "이미 가입됨" };
  }

  await page.locator('button:has-text("카페 가입하기"), button:has-text("가입하기")').first().click({ timeout: 5000 });
  await page.waitForTimeout(4000);

  // Handle relogin if redirected
  const relogged = await handleReloginIfNeeded(page, password);
  if (!relogged) return { ok: false, reason: "재로그인 실패" };

  await page.waitForTimeout(3000);

  // Now should be on join page
  const currentUrl = page.url();
  console.log("    📄 폼 페이지 URL:", currentUrl.slice(0, 100));

  if (!currentUrl.includes("/join") && !currentUrl.includes("MemberJoin")) {
    return { ok: false, reason: "가입 페이지 진입 실패" };
  }

  await fillJoinForm(page, NICKNAME);
  await page.waitForTimeout(1000);

  const submitBtn = page.locator(
    'button:has-text("동의 후 가입하기"), a:has-text("동의 후 가입하기"), button:has-text("가입하기"), button[type="submit"], input[type="submit"]'
  ).first();
  if (!(await submitBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    return { ok: false, reason: "제출 버튼 없음 (폼 페이지)" };
  }
  await submitBtn.click();
  await page.waitForTimeout(5000);

  const result = await page.evaluate(() => document.body.innerText.slice(0, 1500));
  if (/사용할 수 없는 별명|중복/.test(result)) return { ok: false, reason: "별명 충돌" };
  if (/가입이 제한|가입할 수 없습니다/.test(result)) return { ok: false, reason: "가입 제한" };

  // Verify
  await page.goto(cafeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const writeAfter = page.locator('a:has-text("글쓰기"), a[href*="/articles/write"]').first();
  if (await writeAfter.isVisible({ timeout: 1500 }).catch(() => false)) {
    return { ok: true, reason: "가입 완료 (글쓰기 확인)" };
  }
  if (/가입.{0,3}신청.{0,3}완료|승인.{0,3}대기/.test(result)) {
    return { ok: false, reason: "가입신청 완료 (관리자 승인 대기)" };
  }
  return { ok: false, reason: "결과 불명" };
};

const main = async (): Promise<void> => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const acc = await Account.findOne({ accountId: ACCOUNT_ID }).lean();
  if (!acc) throw new Error("계정 없음");

  await acquireAccountLock(ACCOUNT_ID);
  try {
    const loggedIn = await isAccountLoggedIn(ACCOUNT_ID);
    if (!loggedIn) {
      const r = await loginAccount(ACCOUNT_ID, acc.password);
      if (!r.success) throw new Error("로그인 실패: " + r.error);
    }
    const page = await getPageForAccount(ACCOUNT_ID);
    page.on("dialog", async (d: any) => { try { await d.accept(); } catch {} });

    for (const cafe of CAFES) {
      console.log(`\n=== ${cafe.name} ===`);
      try {
        const r = await joinOneCafe(page, cafe, acc.password);
        console.log(`  ${r.ok ? "✅" : "❌"} ${r.reason}`);
      } catch (e: any) {
        console.log(`  💥 에러: ${e.message?.slice(0, 200)}`);
      }
    }

    await saveCookiesForAccount(ACCOUNT_ID);
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
