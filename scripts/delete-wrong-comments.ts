import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
  closeAllContexts,
} from '../src/shared/lib/multi-session';
import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = '25460974';

// 삭제 대상: articleId → 삭제할 댓글 내용 키워드
const DELETE_TARGETS: Array<{
  articleId: number;
  accountId: string;
  keywords: string[];
}> = [
  {
    articleId: 287538,
    accountId: 'ags2oigb',
    keywords: ['다 드시고 또 달라'],
  },
];

const main = async (): Promise<void> => {
  await mongoose.connect(MONGODB_URI);

  for (const target of DELETE_TARGETS) {
    const acc = await Account.findOne({ accountId: target.accountId }).lean();
    if (!acc) {
      console.log(`계정 없음: ${target.accountId}`);
      continue;
    }

    await acquireAccountLock(target.accountId);
    try {
      const loggedIn = await isAccountLoggedIn(target.accountId);
      if (!loggedIn) {
        await loginAccount(target.accountId, acc.password);
      }

      const page = await getPageForAccount(target.accountId);
      page.on('dialog', async (d) => {
        try { await d.accept(); } catch {}
      });

      await page.goto(
        `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${target.articleId}`,
        { waitUntil: 'domcontentloaded', timeout: 30000 }
      );
      await page.waitForTimeout(3000);

      for (const keyword of target.keywords) {
        // 댓글 목록에서 키워드 포함된 댓글 찾기
        const commentElements = await page.$$('.CommentItem, .comment_item');

        for (const el of commentElements) {
          const text = await el.evaluate((node) => node.textContent || '');
          if (!text.includes(keyword)) continue;

          console.log(`삭제 대상 발견: "${keyword}" in #${target.articleId}`);

          // 더보기(⋯) 버튼 클릭
          const optionBtn = await el.$('.comment_tool_button');
          if (!optionBtn) {
            console.log('  더보기 버튼 없음, 스킵');
            continue;
          }

          await optionBtn.click();
          await page.waitForTimeout(500);

          // 삭제 버튼 찾기
          const allBtns = await page.$$('button, a');
          let deleted = false;
          for (const btn of allBtns) {
            const btnText = await btn.evaluate((node) => node.textContent?.trim() || '');
            if (btnText === '삭제') {
              await btn.click();
              await page.waitForTimeout(2000);
              console.log(`  삭제 완료: ${keyword.slice(0, 20)}`);
              deleted = true;
              break;
            }
          }
          if (!deleted) {
            console.log('  삭제 버튼 못 찾음');
            await page.keyboard.press('Escape');
          }

          break; // 해당 키워드 댓글 하나만 삭제
        }
      }
    } finally {
      releaseAccountLock(target.accountId);
    }
  }

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
