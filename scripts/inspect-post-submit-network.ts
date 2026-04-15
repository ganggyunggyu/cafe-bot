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
const CATEGORY = process.env.CATEGORY || '건강 챌린지';

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
        reason: 'inspect_post_submit_network',
      });
      if (!loginResult.success) {
        throw new Error(loginResult.error || 'login failed');
      }
    }

    const page = await getPageForAccount(account.accountId);
    const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}/articles/write?boardType=L&menuId=${cafe.menuId}`;
    const networkEvents: Array<{ status: number; url: string; body?: string; method?: string; postData?: string }> = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (
        url.includes('article') ||
        url.includes('write') ||
        url.includes('register') ||
        url.includes('save')
      ) {
        let body = '';
        if (
          url.includes('/editor/v2.0/') ||
          url.includes('/gw/v4/cafes/')
        ) {
          const rawBody = await response.body().catch(() => Buffer.from(''));
          body = rawBody.toString('utf-8');
        }
        const request = response.request();
        networkEvents.push({
          status: response.status(),
          url,
          method: request.method(),
          postData: request.postData() || '',
          body: body.slice(0, 2000),
        });
      }
    });

    await page.goto(writeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(3_000);

    const title = `[네트워크점검] ${Date.now()}`;
    const body = `네트워크 점검용 본문 ${Date.now()}`;

    const boardSelectButton = await page.$('.FormSelectButton button.button');
    if (boardSelectButton) {
      await boardSelectButton.click();
      await page.waitForTimeout(500);

      const options = await page.$$('ul.option_list li.item button.option');
      for (const option of options) {
        const text = ((await option.textContent()) || '').trim();
        if (text.includes(CATEGORY)) {
          await option.click();
          break;
        }
      }

      await page.waitForTimeout(500);
    }

    const titleInput = await page.waitForSelector(
      '.FlexableTextArea textarea.textarea_input, textarea.textarea_input',
      { timeout: 10_000 }
    );
    await titleInput.click();
    await page.keyboard.type(title, { delay: 40 });

    const contentArea = await page.waitForSelector('p.se-text-paragraph', { timeout: 10_000 });
    await contentArea.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    await page.keyboard.type(body, { delay: 40 });

    const buttons = await page.$$eval('a.BaseButton, button.BaseButton, a, button', (elements) => {
      return elements
        .map((element) => {
          const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
          const className = element.className || '';
          return { text, className };
        })
        .filter((item) => item.text.length > 0)
        .filter((item) => item.text.includes('등록') || item.className.includes('BaseButton'))
        .slice(0, 10);
    });

    console.log('before-click-buttons=');
    for (const [index, button] of buttons.entries()) {
      console.log(`${index + 1}. ${button.text} | ${button.className}`);
    }

    await page.locator('a.BaseButton--skinGreen:has-text("등록")').click();
    await page.waitForTimeout(10_000);

    const visibleTexts = await page.locator('body').innerText().catch(() => '');
    console.log(`currentUrl=${page.url()}`);
    console.log(`bodyPreview=${visibleTexts.slice(0, 1000)}`);
    console.log('networkEvents=');
    for (const event of networkEvents.slice(-30)) {
      console.log(`${event.method || 'GET'} ${event.status} ${event.url}`);
      if (event.postData) {
        console.log(`  postData=${event.postData.slice(0, 2000)}`);
      }
      if (event.body) {
        console.log(`  body=${event.body}`);
      }
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
