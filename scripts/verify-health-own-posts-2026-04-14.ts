import dotenv from 'dotenv';
import mongoose from 'mongoose';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';
import { Account } from '@/shared/models/account';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_DATE = '2026-04-14';

const TARGETS = [
  {
    accountId: '8i2vlbym',
    cafeId: '25636798',
    cafeName: '건강한노후준비',
    cafeUrl: 'freemapleafreecabj',
    keyword: '삼성 헬스 수면 점수 다시 보니까 오늘은 커피를 줄여야겠네요',
  },
  {
    accountId: 'heavyzebra240',
    cafeId: '25227349',
    cafeName: '건강관리소',
    cafeUrl: 'minemh',
    keyword: '우리아이예상키',
  },
  {
    accountId: 'njmzdksm',
    cafeId: '25636798',
    cafeName: '건강한노후준비',
    cafeUrl: 'freemapleafreecabj',
    keyword: '20대 조기폐경 증상',
  },
] as const;

const toKstDateKey = (value: Date): string => {
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

const parseTimestamp = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const asNumber = Number.parseInt(value, 10);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }

    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) {
      return asDate;
    }
  }

  return 0;
};

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
      console.log(`FAIL | ${target.accountId} | 계정 없음`);
      continue;
    }

    await acquireAccountLock(target.accountId);

    try {
      const loggedIn = await isAccountLoggedIn(target.accountId);
      if (!loggedIn) {
        const loginResult = await loginAccount(target.accountId, account.password, {
          waitForLoginMs: 60_000,
          reason: 'verify_health_own_posts',
        });
        if (!loginResult.success) {
          console.log(`FAIL | ${target.accountId} | 로그인 실패 | ${loginResult.error}`);
          continue;
        }
      }

      const page = await getPageForAccount(target.accountId);
      await page.goto(`https://cafe.naver.com/${target.cafeUrl}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });
      await page.waitForFunction(
        () => {
          const globalScope = window as typeof window & { g_sUserMemberKey?: string };
          return Boolean(globalScope.g_sUserMemberKey);
        },
        { timeout: 10_000 }
      ).catch(() => null);
      await page.waitForTimeout(1000);

      const memberKey = await page.evaluate(() => {
        const globalScope = window as typeof window & { g_sUserMemberKey?: string };
        return globalScope.g_sUserMemberKey || '';
      });

      if (!memberKey) {
        console.log(`FAIL | ${target.accountId} | memberKey 없음`);
        continue;
      }

      const apiUrl =
        `https://apis.naver.com/cafe-web/cafe-mobile/CafeMemberNetworkArticleListV3` +
        `?search.cafeId=${target.cafeId}` +
        `&search.memberKey=${encodeURIComponent(memberKey)}` +
        `&search.perPage=15&search.page=1&requestFrom=A`;

      const articles = await page.evaluate(async (url: string) => {
        const response = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return (
          data?.message?.result?.articleList ||
          data?.message?.result?.memberArticleList ||
          data?.message?.result?.list ||
          data?.result?.articleList ||
          data?.result?.memberArticleList ||
          data?.result?.list ||
          []
        );
      }, apiUrl);

      const todayArticles = (articles as Array<{
        articleId?: number;
        articleid?: number;
        subject?: string;
        title?: string;
        writeDateTimestamp?: number | string;
        writeDate?: number | string;
      }>)
        .map((article) => ({
          articleId: article.articleId ?? article.articleid ?? 0,
          subject: article.subject || article.title || '',
          writeDateTimestamp: parseTimestamp(article.writeDateTimestamp ?? article.writeDate),
        }))
        .filter((article) => article.articleId > 0)
        .filter((article) => toKstDateKey(new Date(article.writeDateTimestamp)) === TARGET_DATE);

      const previewArticles = (articles as Array<{
        articleId?: number;
        articleid?: number;
        subject?: string;
        title?: string;
        writeDateTimestamp?: number | string;
        writeDate?: number | string;
      }>)
        .map((article) => ({
          articleId: article.articleId ?? article.articleid ?? 0,
          subject: article.subject || article.title || '',
          writeDateTimestamp: parseTimestamp(article.writeDateTimestamp ?? article.writeDate),
        }))
        .filter((article) => article.articleId > 0)
        .slice(0, 5);

      await saveCookiesForAccount(target.accountId);

      console.log(
        `OK | ${target.cafeName} | ${target.accountId} | today=${todayArticles.length}`
      );
      for (const article of previewArticles) {
        console.log(
          `  preview | #${article.articleId} | ${toKstDateKey(new Date(article.writeDateTimestamp))} | ${article.subject}`
        );
      }
      for (const article of todayArticles) {
        console.log(`  - #${article.articleId} ${article.subject}`);
      }
    } finally {
      releaseAccountLock(target.accountId);
    }
  }
};

main()
  .then(async () => {
    await closeAllContexts();
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await closeAllContexts();
    } catch {}
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
