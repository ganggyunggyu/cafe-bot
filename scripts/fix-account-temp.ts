import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) { console.log("user not found"); return; }
  
  const acc = await Account.findOne({ accountId: "e6yb5u4k" });
  if (acc) {
    console.log(`현재 userId: ${acc.userId} (21lab userId: ${user.userId})`);
    if (acc.userId !== user.userId) {
      acc.userId = user.userId;
      acc.isActive = true;
      await acc.save();
      console.log("✅ userId를 21lab으로 변경 완료");
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
    console.log("✅ 신규 생성 완료");
  }
  
  const count = await Account.countDocuments({ userId: user.userId, isActive: true });
  console.log(`21lab 활성 계정: ${count}개`);
  await mongoose.disconnect();
};
main();
