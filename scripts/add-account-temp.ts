import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) { console.log("user not found"); return; }
  
  const existing = await Account.findOne({ accountId: "e6yb5u4k" });
  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      await existing.save();
      console.log("✅ e6yb5u4k 재활성화 완료");
    } else {
      console.log("ℹ️ e6yb5u4k 이미 활성 상태");
    }
  } else {
    await Account.create({
      userId: user.userId,
      accountId: "e6yb5u4k",
      password: "#ic3duzb1",
      nickname: "봄바람",
      role: "commenter",
      isActive: true,
    });
    console.log("✅ e6yb5u4k (봄바람) 신규 생성 완료");
  }
  
  const count = await Account.countDocuments({ userId: user.userId, isActive: true });
  console.log(`현재 활성 계정: ${count}개`);
  await mongoose.disconnect();
};
main();
