/**
 * laghunter8 카페 가입 상태 진단
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

const CAFES = [
  { name: "쇼핑지름신", cafeId: "25729954", cafeUrl: "shopjirmsin" },
  { name: "건강관리소", cafeId: "25227349", cafeUrl: "minemh" },
];

const main = async (): Promise<void> => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  // Re-activate just for diagnosis
  const acc = await Account.findOne({ accountId: ACCOUNT_ID }).lean();
  if (!acc) throw new Error("계정 없음");

  await acquireAccountLock(ACCOUNT_ID);
  try {
    const loggedIn = await isAccountLoggedIn(ACCOUNT_ID);
    if (!loggedIn) {
      const r = await loginAccount(ACCOUNT_ID, acc.password);
      if (!r.success) {
        console.log("로그인 실패:", r.error);
        return;
      }
    }
    console.log("✅ 로그인됨\n");

    const page = await getPageForAccount(ACCOUNT_ID);

    for (const cafe of CAFES) {
      console.log(`=== ${cafe.name} (${cafe.cafeId}) ===`);
      const url = `https://m.cafe.naver.com/ca-fe/web/cafes/${cafe.cafeId}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);

      const finalUrl = page.url();
      console.log("최종 URL:", finalUrl);

      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1500));
      console.log("페이지 텍스트 (앞 1500자):");
      console.log(bodyText);

      // Check for various states
      const checks = [
        ["가입 버튼", "가입하기"],
        ["가입신청 완료/대기", "가입 신청|승인 대기|승인 후|신청 완료"],
        ["글쓰기 버튼", "글쓰기"],
        ["별명 오류", "사용할 수 없는 별명|별명을 다시"],
        ["가입 거절", "가입이 제한|가입할 수 없습니다"],
      ];
      console.log("\n상태 체크:");
      for (const [label, regex] of checks) {
        const match = new RegExp(regex).test(bodyText);
        console.log(`  ${match ? '✓' : '✗'} ${label}`);
      }
      console.log("\n");
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
