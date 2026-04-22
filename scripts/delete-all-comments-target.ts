/**
 * 특정 글 목록의 모든 댓글/대댓글 삭제
 *
 * PublishedArticle.comments 배열에서 (articleId, accountId) 조합을 뽑아
 * 각 계정으로 로그인 → 본인 댓글/대댓글 전부 삭제.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/delete-all-comments-target.ts
 */

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
import { PublishedArticle } from '../src/shared/models';
import type { Page } from 'playwright';

const MONGODB_URI = process.env.MONGODB_URI!;

const TARGETS: Array<{ cafeId: string; articleId: number }> = [
  { cafeId: '25636798', articleId: 31308 },
  { cafeId: '25636798', articleId: 31309 },
  { cafeId: '25636798', articleId: 31310 },
  { cafeId: '25636798', articleId: 31311 },
  { cafeId: '25636798', articleId: 31312 },
  { cafeId: '25636798', articleId: 31313 },
  { cafeId: '25636798', articleId: 31314 },
  { cafeId: '25636798', articleId: 31315 },
  { cafeId: '25636798', articleId: 31316 },
  { cafeId: '25636798', articleId: 31317 },
  { cafeId: '25227349', articleId: 1303 },
  { cafeId: '25227349', articleId: 1304 },
  { cafeId: '25227349', articleId: 1305 },
  { cafeId: '25227349', articleId: 1307 },
  { cafeId: '25227349', articleId: 1308 },
  { cafeId: '25227349', articleId: 1309 },
  { cafeId: '25227349', articleId: 1310 },
  { cafeId: '25227349', articleId: 1312 },
  { cafeId: '25227349', articleId: 1313 },
  { cafeId: '25227349', articleId: 1315 },
  { cafeId: '25227349', articleId: 1316 },
];

const deleteAllMyCommentsOnArticle = async (
  page: Page,
  cafeId: string,
  articleId: number,
): Promise<number> => {
  const url = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);

  try {
    await page.waitForSelector('.CommentItem', { timeout: 8000 });
  } catch {
    return 0;
  }

  let totalDeleted = 0;
  let safety = 0;

  while (safety < 60) {
    safety += 1;

    const mineCount = await page.evaluate(() => {
      return document.querySelectorAll('.CommentItem--mine').length;
    });

    if (mineCount === 0) break;

    try {
      const li = await page.$('.CommentItem--mine');
      if (!li) break;

      await li.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      const btn = await li.$('button.comment_tool_button');
      if (!btn) {
        const retry = await li.$('button.comment_tool_button');
        if (!retry) break;
        await retry.click();
      } else {
        await btn.click();
      }
      await page.waitForTimeout(600);

      const menuItems = await page.$$('.layer_menu button, .layer_menu a, [role="menu"] button, [role="menuitem"], button, a');
      let clicked = false;
      for (const item of menuItems) {
        const text = (await item.textContent())?.trim() || '';
        if (text === '삭제') {
          try {
            await item.click();
            clicked = true;
            break;
          } catch {
            // continue
          }
        }
      }
      if (!clicked) {
        await page.keyboard.press('Escape');
        break;
      }
      await page.waitForTimeout(500);

      // 확인 다이얼로그
      page.once('dialog', async (dialog) => {
        try { await dialog.accept(); } catch {}
      });
      const confirmBtn = await page.$('button:has-text("확인")');
      if (confirmBtn) {
        try { await confirmBtn.click(); } catch {}
      }
      await page.waitForTimeout(900);

      totalDeleted += 1;
      console.log(`    ✂ #${articleId} 댓글 삭제 ${totalDeleted}개`);
    } catch (err) {
      // 개별 실패는 스킵하고 다음 루프에서 재시도
      await page.waitForTimeout(500);
    }
  }

  return totalDeleted;
};

const main = async () => {
  await mongoose.connect(MONGODB_URI);

  // DB에서 댓글 단 계정 목록 집계
  const byAccount = new Map<string, Set<string>>(); // accountId → set of "cafeId:articleId"

  for (const target of TARGETS) {
    const article = await PublishedArticle.findOne({
      cafeId: target.cafeId,
      articleId: target.articleId,
    }).lean();
    if (!article) {
      console.log(`글 없음: ${target.cafeId}/${target.articleId}`);
      continue;
    }
    for (const c of article.comments || []) {
      if (!c.accountId) continue;
      const key = `${target.cafeId}:${target.articleId}`;
      if (!byAccount.has(c.accountId)) byAccount.set(c.accountId, new Set());
      byAccount.get(c.accountId)!.add(key);
    }
  }

  console.log(`\n작업 대상 계정 ${byAccount.size}개\n`);

  for (const [accountId, articleKeys] of byAccount) {
    const acc = await Account.findOne({ accountId }).lean();
    if (!acc) {
      console.log(`  ⚠ 계정 없음: ${accountId}`);
      continue;
    }

    console.log(`\n====== ${accountId} — 대상 글 ${articleKeys.size}개 ======`);

    await acquireAccountLock(accountId);
    try {
      const loggedIn = await isAccountLoggedIn(accountId);
      if (!loggedIn) {
        const r = await loginAccount(accountId, acc.password);
        if (!r.success) {
          console.log(`  로그인 실패: ${r.error}`);
          continue;
        }
      }
      const page = await getPageForAccount(accountId);
      page.on('dialog', async (d) => {
        try { await d.accept(); } catch {}
      });

      for (const key of articleKeys) {
        const [cafeId, articleIdStr] = key.split(':');
        const articleId = parseInt(articleIdStr, 10);
        try {
          const deleted = await deleteAllMyCommentsOnArticle(page, cafeId, articleId);
          console.log(`  → ${cafeId}/${articleId} 삭제 ${deleted}개`);
        } catch (err) {
          console.log(`  ⚠ ${cafeId}/${articleId} 실패: ${err instanceof Error ? err.message : err}`);
        }
      }
    } finally {
      await releaseAccountLock(accountId);
    }
  }

  // DB comments 초기화
  for (const target of TARGETS) {
    await PublishedArticle.updateOne(
      { cafeId: target.cafeId, articleId: target.articleId },
      { $set: { comments: [], commentCount: 0, replyCount: 0 } },
    );
  }
  console.log('\n✅ DB comments 초기화 완료');

  await closeAllContexts();
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
