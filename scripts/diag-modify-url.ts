import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import mongoose from 'mongoose';
import {
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  closeAllContexts,
} from '../src/shared/lib/multi-session';
import { Account } from '../src/shared/models/account';

const CAFE_ID = '25636798';
const ARTICLE_ID = 31318;
const ACCOUNT_ID = '8i2vlbym';

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  const acc = await Account.findOne({ accountId: ACCOUNT_ID }).lean();
  if (!acc) throw new Error('no account');

  await acquireAccountLock(ACCOUNT_ID);
  try {
    if (!(await isAccountLoggedIn(ACCOUNT_ID))) {
      const r = await loginAccount(ACCOUNT_ID, acc.password);
      if (!r.success) throw new Error(r.error);
    }
    const page = await getPageForAccount(ACCOUNT_ID);

    console.log('[STEP 1] 글 보기 페이지로 먼저 이동');
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${ARTICLE_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    console.log('  current URL:', page.url());
    console.log('  title:', await page.title());

    // 수정 버튼 찾기 (글 보기 페이지에서 수정 링크/버튼 탐색)
    const editLinks = await page.evaluate(() => {
      const candidates: Array<{tag: string; text: string; href: string | null}> = [];
      const nodes = document.querySelectorAll('a, button');
      for (const el of nodes) {
        const text = (el.textContent || '').trim();
        if (text === '수정' || text === '글수정' || text === '편집') {
          const href = (el as HTMLAnchorElement).href || null;
          candidates.push({ tag: el.tagName, text, href });
        }
      }
      return candidates;
    });
    console.log('[STEP 2] 수정 버튼/링크 후보:', JSON.stringify(editLinks, null, 2));

    console.log('\n[STEP 3] /modify 직접 이동 시도');
    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${ARTICLE_ID}/modify`;
    await page.goto(modifyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    console.log('  current URL:', page.url());
    console.log('  title:', await page.title());

    const textareaCount = await page.evaluate(() => {
      return {
        textareas: document.querySelectorAll('textarea').length,
        inputTypes: document.querySelectorAll('textarea.textarea_input').length,
        flexable: document.querySelectorAll('.FlexableTextArea').length,
        se_paragraph: document.querySelectorAll('p.se-text-paragraph').length,
      };
    });
    console.log('  editor elements:', textareaCount);

  } finally {
    await releaseAccountLock(ACCOUNT_ID);
  }
  await closeAllContexts();
  await mongoose.disconnect();
};

main().catch(e => { console.error(e); process.exit(1); });
