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
import type { Page } from 'playwright';

const CAFE_ID = '25636798';
const ARTICLE_ID = 31308;
const ACCOUNT_ID = 'heavyzebra240';

const deleteAllMine = async (page: Page, cafeId: string, articleId: number): Promise<number> => {
  await page.goto(`https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);
  try { await page.waitForSelector('.CommentItem', { timeout: 8000 }); } catch { return 0; }

  let total = 0;
  for (let safety = 0; safety < 40; safety++) {
    const count = await page.evaluate(() => document.querySelectorAll('.CommentItem--mine').length);
    console.log(`[iter ${safety}] 내 댓글 ${count}개 남음`);
    if (count === 0) break;

    try {
      const li = await page.$('.CommentItem--mine');
      if (!li) break;
      await li.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const btn = await li.$('button.comment_tool_button');
      if (!btn) { console.log('no tool button'); break; }
      await btn.click();
      await page.waitForTimeout(600);

      const menuItems = await page.$$('.layer_menu button, .layer_menu a, [role="menu"] button, [role="menuitem"], button, a');
      let clicked = false;
      for (const item of menuItems) {
        const t = ((await item.textContent()) || '').trim();
        if (t === '삭제') {
          try { await item.click(); clicked = true; break; } catch {}
        }
      }
      if (!clicked) { console.log('no 삭제 button'); await page.keyboard.press('Escape'); break; }
      await page.waitForTimeout(500);
      page.once('dialog', async d => { try { await d.accept(); } catch {} });
      const confirm = await page.$('button:has-text("확인")');
      if (confirm) { try { await confirm.click(); } catch {} }
      await page.waitForTimeout(1200);
      total += 1;
      console.log(`  삭제 ${total}건`);
    } catch (e) {
      console.log('err:', e instanceof Error ? e.message : e);
      await page.waitForTimeout(500);
    }
  }
  return total;
};

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
    page.on('dialog', async d => { try { await d.accept(); } catch {} });
    const deleted = await deleteAllMine(page, CAFE_ID, ARTICLE_ID);
    console.log(`\n총 삭제: ${deleted}개`);
  } finally {
    await releaseAccountLock(ACCOUNT_ID);
  }
  await closeAllContexts();
  await mongoose.disconnect();
};

main().catch(e => { console.error(e); process.exit(1); });
