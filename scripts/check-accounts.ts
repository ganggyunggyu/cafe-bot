import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import { User } from '../src/shared/models/user';

const LOGIN_ID = process.env.LOGIN_ID || '21lab';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: LOGIN_ID }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({ userId: user.userId, isActive: true })
    .sort({ role: -1, createdAt: 1 })
    .lean();

  console.log(`\n=== ${LOGIN_ID} 계정 목록 (총 ${accounts.length}개) ===\n`);
  console.log(`이름\t\t역할\tID\t\tPW`);
  console.log(`─`.repeat(70));
  for (const a of accounts) {
    const role = a.role === 'writer' ? '글작성' : '댓글';
    console.log(`${a.nickname}\t${role}\t${a.accountId}\t${a.password}`);
  }

  await mongoose.disconnect();
};

main().catch(console.error);
