/**
 * 미가입 계정 카페 가입 + 캡차 실패 계정 임시 비활성화
 */
import mongoose from "mongoose";
import { Account } from "../src/shared/models/account";
import { Cafe } from "../src/shared/models/cafe";
import { joinCafeWithAccount } from "../src/features/auto-comment/batch/cafe-join";
import { closeAllContexts } from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;

const JOIN_TARGETS: Array<{ accountId: string; cafeIds: string[] }> = [
  { accountId: "laghunter8", cafeIds: ["25227349", "25636798", "25460974", "25729954"] },
  { accountId: "ahffkekd12", cafeIds: ["25729954"] },
  { accountId: "dhtksk1p", cafeIds: ["25729954"] },
];

const DISABLE_ACCOUNT_IDS = ["loand3324"];

const main = async (): Promise<void> => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  console.log("=== loand3324 임시 비활성화 ===");
  for (const accId of DISABLE_ACCOUNT_IDS) {
    const r = await Account.updateOne({ accountId: accId }, { $set: { isActive: false } });
    console.log(`  ${accId}: matched=${r.matchedCount} modified=${r.modifiedCount}`);
  }

  console.log("\n=== 카페 가입 처리 ===");
  for (const { accountId, cafeIds } of JOIN_TARGETS) {
    const acc = await Account.findOne({ accountId }).lean();
    if (!acc) {
      console.log(`  ❌ ${accountId}: 계정 없음`);
      continue;
    }

    for (const cafeId of cafeIds) {
      const cafe = await Cafe.findOne({ cafeId }).lean();
      const cafeName = cafe?.name || cafeId;
      const cafeUrl = cafe?.cafeUrl;

      console.log(`  → ${accountId} → ${cafeName} (${cafeId})`);
      try {
        const result = await joinCafeWithAccount(
          { id: acc.accountId, password: acc.password, nickname: acc.nickname || acc.accountId },
          cafeId,
          cafeUrl ? { cafeUrl } : {}
        );
        if (result.success) {
          console.log(`    ✅ ${result.alreadyMember ? "이미 가입됨" : "가입 완료"}`);
        } else {
          console.log(`    ❌ 실패: ${result.error}`);
        }
      } catch (e: any) {
        console.log(`    💥 에러: ${e.message}`);
      }
    }
  }

  console.log("\n=== 완료 ===");
  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
