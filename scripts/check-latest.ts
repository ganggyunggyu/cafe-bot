import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
} from '../src/shared/lib/multi-session';

const CAFES = [
  { name: '샤넬오픈런', cafeId: '25460974', url: 'shoppingtpw' },
  { name: '쇼핑지름신', cafeId: '25729954', url: 'shopjirmsin' },
];

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: '21lab', isActive: true }).lean();
  if (!user) throw new Error('user not found');

  const acc = await Account.findOne({ userId: user.userId, isActive: true, role: 'writer' }).lean();
  if (!acc) throw new Error('no writer');

  await acquireAccountLock(acc.accountId);
  const loggedIn = await isAccountLoggedIn(acc.accountId);
  if (!loggedIn) await loginAccount(acc.accountId, acc.password);

  const page = await getPageForAccount(acc.accountId);

  for (const cafe of CAFES) {
    await page.goto(`https://cafe.naver.com/${cafe.url}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);

    const apiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${cafe.cafeId}&search.menuid=0&search.page=1&search.perPage=10&search.queryType=lastArticle&search.boardtype=L`;

    const result = await page.evaluate(async (u: string) => {
      try {
        const res = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, apiUrl);

    console.log(`=== ${cafe.name} (${cafe.url}) ===`);
    if (result.error) {
      console.log(`에러: ${result.error}`);
      continue;
    }
    const list = result.message?.result?.articleList || [];
    list.slice(0, 10).forEach((a: any, i: number) => {
      console.log(`${i + 1}. #${a.articleId} [${a.nickname || '?'}] ${a.subject}`);
    });
    console.log('');
  }

  releaseAccountLock(acc.accountId);
  await mongoose.disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
