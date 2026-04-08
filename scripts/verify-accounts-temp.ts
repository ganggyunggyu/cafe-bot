import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) { console.log("user not found"); return; }
  
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  
  console.log(`총 활성 계정: ${accounts.length}개\n`);
  
  const writers = accounts.filter(a => a.role === "writer");
  const commenters = accounts.filter(a => a.role === "commenter");
  
  console.log(`=== Writer (${writers.length}명) ===`);
  for (const a of writers) {
    console.log(`${a.nickname}\t${a.accountId}\t${a.role}`);
  }
  
  console.log(`\n=== Commenter (${commenters.length}명) ===`);
  for (const a of commenters) {
    console.log(`${a.nickname}\t${a.accountId}\t${a.role}`);
  }
  
  // 유저가 보낸 계정 목록과 대조
  const expectedWriters = ["olgdmp9921", "yenalk", "eytkgy5500", "uqgidh2690", "4giccokx"];
  const expectedCommenters = ["8i2vlbym", "heavyzebra240", "njmzdksm", "e6yb5u4k", "suc4dce7", "xzjmfn3f", "8ua1womn", "0ehz3cb2", "umhu0m83", "br5rbg", "beautifulelephant274", "angrykoala270", "tinyfish183", "orangeswan630"];
  
  const dbIds = new Set(accounts.map(a => a.accountId));
  
  console.log("\n=== 검증 ===");
  for (const id of [...expectedWriters, ...expectedCommenters]) {
    const match = accounts.find(a => a.accountId === id);
    if (!match) console.log(`❌ DB에 없음: ${id}`);
    else if (!match.isActive) console.log(`⚠️ 비활성: ${id}`);
  }
  console.log("검증 완료");
  
  await mongoose.disconnect();
};
main();
