import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";

const WRITERS = [
  { accountId: "loand3324", password: "akfalwk12", nickname: "라우드" },
  { accountId: "compare14310", password: "akfalwk12", nickname: "룰루랄라" },
  { accountId: "ags2oigb", password: "dlrbghdqudtls", nickname: "찐찐찐찐찐이야" },
  { accountId: "wound12567", password: "akfalwk12", nickname: "투디치과 스킨블" },
  { accountId: "precede1451", password: "akfalwk12!!", nickname: "토토리토" },
];

const COMMENTERS = [
  { accountId: "regular14631", password: "r46f9sqy1", nickname: "소원" },
  { accountId: "8i2vlbym", password: "8wn@1i7u1", nickname: "꼬리별" },
  { accountId: "njmzdksm", password: "i5*wx7v11", nickname: "달달한하루" },
  { accountId: "0ehz3cb2", password: "8&ofp4h)1", nickname: "오차즈케" },
  { accountId: "suc4dce7", password: "*i93h&6p1", nickname: "오늘도 즐겁게" },
  { accountId: "xzjmfn3f", password: "ir%3(pw*1", nickname: "스탠드" },
  { accountId: "8ua1womn", password: "efe9uwk71", nickname: "세월" },
  { accountId: "selzze", password: "sadito0229!", nickname: "해리포터 1" },
  { accountId: "4giccokx", password: "wsofzj(m1", nickname: "듣는방법" },
  { accountId: "uqgidh2690", password: "i1ytev4q1", nickname: "달리자" },
  { accountId: "eytkgy5500", password: "pW3*zA91", nickname: "뽀또" },
  { accountId: "yenalk", password: "sadito0229!", nickname: "미식가 2" },
  { accountId: "br5rbg", password: "49thf9gz", nickname: "기쁨의꽃" },
  { accountId: "beautifulelephant274", password: "wn#5ze7#1", nickname: "뷰티풀" },
];

const main = async () => {
  const uri = process.env.MONGODB_URI || "";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (user === null) { console.log("user not found"); return; }
  const userId = (user as any).userId;

  // 1. 메인 계정 제외하고 전부 삭제
  const deleted = await Account.deleteMany(
    { userId, isMain: { $ne: true } }
  );
  console.log(`기존 계정 ${deleted.deletedCount}개 삭제`);

  // 2. Writer 계정 upsert
  console.log("\n=== Writer 계정 업데이트 ===");
  for (const w of WRITERS) {
    const result = await Account.updateOne(
      { userId, accountId: w.accountId },
      { $set: { password: w.password, nickname: w.nickname, role: "writer", isActive: true, isMain: false } },
      { upsert: true }
    );
    const status = result.upsertedCount > 0 ? "신규" : "업데이트";
    console.log(`${w.accountId} (${w.nickname}) → ${status}`);
  }

  // 3. Commenter 계정 upsert
  console.log("\n=== Commenter 계정 업데이트 ===");
  for (const c of COMMENTERS) {
    const result = await Account.updateOne(
      { userId, accountId: c.accountId },
      { $set: { password: c.password, nickname: c.nickname, role: "commenter", isActive: true, isMain: false } },
      { upsert: true }
    );
    const status = result.upsertedCount > 0 ? "신규" : "업데이트";
    console.log(`${c.accountId} (${c.nickname}) → ${status}`);
  }

  // 4. 결과 확인
  const activeWriters = await Account.find({ userId, role: "writer", isActive: true }).lean();
  const activeCommenters = await Account.find({ userId, role: "commenter", isActive: true }).lean();
  const mainAccount = await Account.findOne({ userId, isMain: true, isActive: true }).lean();

  console.log("\n========== 최종 결과 ==========");
  if (mainAccount) console.log(`메인: ${(mainAccount as any).accountId} (${(mainAccount as any).nickname})`);
  console.log(`\nWriter ${activeWriters.length}개:`);
  activeWriters.forEach((a: any) => console.log(`  ${a.accountId} / ${a.nickname}`));
  console.log(`\nCommenter ${activeCommenters.length}개:`);
  activeCommenters.forEach((a: any) => console.log(`  ${a.accountId} / ${a.nickname}`));

  await mongoose.disconnect();
};
main();
