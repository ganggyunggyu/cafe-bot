import dotenv from 'dotenv';
import mongoose from 'mongoose';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import { Account } from '@/shared/models/account';
import { Cafe } from '@/shared/models/cafe';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'heavyzebra240';
const CAFE_ID = process.env.CAFE_ID || '25227349';

const main = async (): Promise<void> => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const [account, cafe] = await Promise.all([
    Account.findOne({ userId: user.userId, accountId: ACCOUNT_ID, isActive: true }).lean(),
    Cafe.findOne({ userId: user.userId, cafeId: CAFE_ID, isActive: true }).lean(),
  ]);

  if (!account) {
    throw new Error(`account not found: ${ACCOUNT_ID}`);
  }
  if (!cafe) {
    throw new Error(`cafe not found: ${CAFE_ID}`);
  }

  await acquireAccountLock(account.accountId);

  try {
    const loggedIn = await isAccountLoggedIn(account.accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(account.accountId, account.password, {
        waitForLoginMs: 60_000,
        reason: 'inspect_write_buttons',
      });
      if (!loginResult.success) {
        throw new Error(loginResult.error || 'login failed');
      }
    }

    const page = await getPageForAccount(account.accountId);
    const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}/articles/write?boardType=L&menuId=${cafe.menuId}`;
    await page.goto(writeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);

    const buttons = await page.$$eval('a.BaseButton, button.BaseButton, a, button', (elements) => {
      return elements
        .map((element) => {
          const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
          const className = element.className || '';
          const href = element.getAttribute('href') || '';
          return { text, className, href };
        })
        .filter((item) => item.text.length > 0)
        .filter((item) => item.text.includes('등록') || item.text.includes('저장') || item.className.includes('BaseButton'))
        .slice(0, 20);
    });

    const titleExists = await page.$('.FlexableTextArea textarea.textarea_input, textarea.textarea_input');

    console.log(`writeUrl=${writeUrl}`);
    console.log(`titleInput=${titleExists ? 'yes' : 'no'}`);
    for (const [index, button] of buttons.entries()) {
      console.log(
        `${index + 1}. text="${button.text}" class="${button.className}" href="${button.href}"`
      );
    }
  } finally {
    releaseAccountLock(account.accountId);
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
