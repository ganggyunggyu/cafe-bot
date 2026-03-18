import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";

const main = async () => {
  const uri = process.env.MONGODB_URI || "";
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (user === null) { console.log("user not found"); return; }
  const accounts = await Account.find({ userId: (user as any).userId, isActive: true }).lean();
  const writers = accounts.filter((a: any) => a.role === "writer");
  const commenters = accounts.filter((a: any) => a.role === "commenter");
  console.log("=== Writer 계정 (" + writers.length + "개) ===");
  writers.forEach((a: any) => console.log(a.accountId + " / " + (a.nickname || "-")));
  console.log("\n=== Commenter 계정 (" + commenters.length + "개) ===");
  commenters.forEach((a: any) => console.log(a.accountId + " / " + (a.nickname || "-")));
  await mongoose.disconnect();
};
main();
