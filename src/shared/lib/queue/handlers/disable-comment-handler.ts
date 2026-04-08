import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import type { DisableCommentJobData, JobResult } from '../types';

export interface DisableCommentHandlerContext {
  account: NaverAccount;
}

export const handleDisableCommentJob = async (
  data: DisableCommentJobData,
  ctx: DisableCommentHandlerContext
): Promise<JobResult> => {
  const { account } = ctx;
  const { cafeId, articleId } = data;

  await acquireAccountLock(account.id);

  try {
    const loggedIn = await isAccountLoggedIn(account.id);
    if (!loggedIn) {
      const r = await loginAccount(account.id, account.password);
      if (!r.success) {
        return { success: false, error: `로그인 실패: ${r.error}` };
      }
    }

    const page = await getPageForAccount(account.id);
    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}/modify`;

    await page.goto(modifyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
      await page.waitForSelector('#coment', { timeout: 15000 });
    } catch {
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

    const cb = await page.$('#coment');
    if (!cb) {
      return { success: false, error: '댓글 체크박스 없음' };
    }

    const isChecked = await cb.evaluate((el) => (el as HTMLInputElement).checked);
    if (!isChecked) {
      console.log(`[DISABLE-COMMENT] #${articleId} 이미 차단 상태`);
      return { success: true, articleId };
    }

    const label = await page.$('label[for="coment"]');
    if (label) await label.click();
    else await cb.click();
    await page.waitForTimeout(500);

    const submitBtn = await page.$('a.BaseButton--skinGreen, a.BaseButton');
    if (!submitBtn) {
      return { success: false, error: '수정 버튼 없음' };
    }

    await submitBtn.click();

    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
    } catch {
      await page.waitForTimeout(3000);
    }

    await saveCookiesForAccount(account.id);
    console.log(`[DISABLE-COMMENT] #${articleId} 댓글 차단 완료`);

    return { success: true, articleId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { success: false, error: msg };
  } finally {
    releaseAccountLock(account.id);
  }
};
