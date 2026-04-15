import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { browseCafePosts } from '@/shared/lib/cafe-browser';
import { Account } from '@/shared/models/account';
import { Cafe } from '@/shared/models/cafe';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;

const TARGETS = [
  {
    cafeId: '25636798',
    accountId: '8i2vlbym',
    articleIds: [31139, 31140],
    cafeName: '건강한노후준비',
  },
  {
    cafeId: '25227349',
    accountId: 'heavyzebra240',
    articleIds: [1111],
    cafeName: '건강관리소',
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

  const [accounts, cafes] = await Promise.all([
    Account.find({ userId: user.userId, isActive: true }).lean(),
    Cafe.find({ userId: user.userId, isActive: true }).lean(),
  ]);
  const accountMap = new Map(accounts.map((account) => [account.accountId, account]));
  const cafeMap = new Map(cafes.map((cafe) => [cafe.cafeId, cafe]));

  for (const target of TARGETS) {
    const account = accountMap.get(target.accountId);
    const cafe = cafeMap.get(target.cafeId);

    if (!account || !cafe) {
      console.log(`FAIL | ${target.cafeName} | account/cafe missing`);
      continue;
    }

    const result = await browseCafePosts(
      {
        id: account.accountId,
        password: account.password,
        nickname: account.nickname,
      },
      cafe.cafeId,
      Number.parseInt(cafe.menuId, 10),
      {
        perPage: 15,
        cafeUrl: cafe.cafeUrl,
      }
    );

    if (!result.success) {
      console.log(`FAIL | ${target.cafeName} | ${result.error}`);
      continue;
    }

    console.log(`OK | ${target.cafeName}`);
    for (const article of result.articles.slice(0, 10)) {
      const marker = target.articleIds.includes(article.articleId) ? '*' : ' ';
      console.log(`${marker} #${article.articleId} ${article.subject}`);
    }
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
