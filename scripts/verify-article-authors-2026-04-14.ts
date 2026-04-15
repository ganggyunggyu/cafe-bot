import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { readCafeArticleContent } from '@/shared/lib/cafe-article-reader';
import { Account } from '@/shared/models/account';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;

const TARGETS = [
  {
    accountId: '8i2vlbym',
    cafeId: '25636798',
    articleId: 31139,
  },
  {
    accountId: 'heavyzebra240',
    cafeId: '25227349',
    articleId: 1111,
  },
  {
    accountId: 'njmzdksm',
    cafeId: '25636798',
    articleId: 31140,
  },
] as const;

const main = async (): Promise<void> => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const accountMap = new Map(accounts.map((account) => [account.accountId, account]));

  for (const target of TARGETS) {
    const account = accountMap.get(target.accountId);
    if (!account) {
      console.log(`FAIL | ${target.accountId} | account missing`);
      continue;
    }

    const result = await readCafeArticleContent(
      {
        id: account.accountId,
        password: account.password,
        nickname: account.nickname,
      },
      target.cafeId,
      target.articleId
    );

    if (!result.success) {
      console.log(`FAIL | ${target.accountId} | #${target.articleId} | ${result.error}`);
      continue;
    }

    console.log(
      `OK | ${target.accountId} | #${target.articleId} | author=${result.authorNickname || '-'} | title=${result.title || '-'}`
    );
  }
};

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
