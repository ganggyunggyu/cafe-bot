import type { Page } from 'playwright';
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  invalidateLoginCache,
  isLoginRedirect,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import { incrementActivity } from '@/shared/models/daily-activity';

export interface WriteCommentResult {
  accountId: string;
  success: boolean;
  error?: string;
}

const ensureLoggedIn = async (
  id: string,
  password: string
): Promise<{ success: true } | { success: false; error: string }> => {
  const loggedIn = await isAccountLoggedIn(id);
  if (loggedIn) return { success: true };

  const loginResult = await loginAccount(id, password);
  if (!loginResult.success) {
    return { success: false, error: loginResult.error || '로그인 실패' };
  }
  return { success: true };
};

const navigateToArticle = async (
  page: Page,
  articleUrl: string,
  id: string,
  password: string,
  logPrefix: string
): Promise<{ success: true } | { success: false; error: string }> => {
  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const currentUrl = page.url();
  if (!isLoginRedirect(currentUrl)) return { success: true };

  console.log(`[${logPrefix}] ${id} 세션 만료 감지 - 재로그인 시도`);
  invalidateLoginCache(id);

  const reloginResult = await loginAccount(id, password);
  if (!reloginResult.success) {
    return { success: false, error: `세션 만료 후 재로그인 실패: ${reloginResult.error}` };
  }

  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return { success: true };
};

const checkErrorPopup = async (page: Page): Promise<string | null> => {
  const errorPopup = await page.$('.LayerPopup, .popup_layer, [role="alertdialog"]');
  if (!errorPopup) return null;

  const errorText = await errorPopup.textContent();
  if (errorText?.includes('권한') || errorText?.includes('없습니다')) {
    return errorText.trim().slice(0, 100) || '권한 에러';
  }
  return null;
};

export const writeCommentWithAccount = async (
  account: NaverAccount,
  cafeId: string,
  articleId: number,
  content: string
): Promise<WriteCommentResult> => {
  const { id, password } = account;

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { accountId: id, success: false, error: loginCheck.error };
    }

    const page = await getPageForAccount(id);
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    const navResult = await navigateToArticle(page, articleUrl, id, password, 'COMMENT');
    if (!navResult.success) {
      return { accountId: id, success: false, error: navResult.error };
    }

    const notFoundIndicator = await page.$('.error_content, .deleted_article, .no_article');
    if (notFoundIndicator) {
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:글이 아직 처리 중이거나 삭제됨' };
    }

    let commentInput = null;
    try {
      commentInput = await page.waitForSelector('textarea.comment_inbox_text', { timeout: 10000 });
    } catch {
      const frameHandle = await page.$('iframe#cafe_main');
      if (frameHandle) {
        const frame = await frameHandle.contentFrame();
        if (frame) {
          try {
            commentInput = await frame.waitForSelector('textarea.comment_inbox_text', { timeout: 5000 });
          } catch {}
        }
      }
    }

    if (!commentInput) {
      console.log(`[COMMENT] ${id} 댓글 입력창 없음 - URL: ${page.url()}`);
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:댓글 입력창을 찾을 수 없습니다. 글이 아직 처리 중일 수 있습니다.' };
    }

    await commentInput.click();
    await page.waitForTimeout(500);
    await commentInput.fill(content);
    await page.waitForTimeout(500);

    let submitButton = await page.$('a.btn_register');
    if (!submitButton) {
      const frameHandle = await page.$('iframe#cafe_main');
      if (frameHandle) {
        const frame = await frameHandle.contentFrame();
        if (frame) {
          submitButton = await frame.$('a.btn_register');
        }
      }
    }

    if (!submitButton) {
      return { accountId: id, success: false, error: '등록 버튼(a.btn_register)을 찾을 수 없습니다.' };
    }

    await submitButton.click();
    await page.waitForTimeout(1500);

    const errorMessage = await checkErrorPopup(page);
    if (errorMessage) {
      return { accountId: id, success: false, error: errorMessage };
    }

    const commentAreas = await page.$$('.comment_area');
    const contentPreview = content.slice(0, 15);
    let found = false;

    for (const area of commentAreas) {
      const text = await area.textContent();
      if (text?.includes(contentPreview)) {
        found = true;
        break;
      }
    }

    if (!found) {
      return { accountId: id, success: false, error: '댓글이 등록되지 않음 (목록에서 확인 불가)' };
    }

    await saveCookiesForAccount(id);
    await incrementActivity(id, cafeId, 'comments');

    return { accountId: id, success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { accountId: id, success: false, error: errorMsg };
  } finally {
    releaseAccountLock(id);
  }
}

export const writeReplyWithAccount = async (
  account: NaverAccount,
  cafeId: string,
  articleId: number,
  content: string,
  commentIndex: number = 0
): Promise<WriteCommentResult> => {
  const { id, password } = account;

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { accountId: id, success: false, error: loginCheck.error };
    }

    const page = await getPageForAccount(id);
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    const navResult = await navigateToArticle(page, articleUrl, id, password, 'REPLY');
    if (!navResult.success) {
      return { accountId: id, success: false, error: navResult.error };
    }

    await page.waitForTimeout(1500);

    const replyButtons = await page.$$('a.comment_info_button');
    if (replyButtons.length === 0) {
      console.log(`[REPLY] ${id} 답글쓰기 버튼 없음 - URL: ${page.url()}`);
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:답글쓰기 버튼을 찾을 수 없습니다. 댓글이 아직 없을 수 있습니다.' };
    }

    let targetIndex = commentIndex;
    if (targetIndex >= replyButtons.length) {
      console.log(`[REPLY] ${id} 대댓글 인덱스 ${targetIndex} → ${replyButtons.length - 1}로 조정 (총 ${replyButtons.length}개 댓글)`);
      targetIndex = replyButtons.length - 1;
    }

    await replyButtons[targetIndex].click();
    await page.waitForTimeout(1000);

    const replyInput = await page.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');
    if (!replyInput) {
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:대댓글 입력창을 찾을 수 없습니다.' };
    }

    await replyInput.click();
    await page.waitForTimeout(500);
    await replyInput.fill(content);
    await page.waitForTimeout(500);

    const submitButton = await page.$('.CommentWriter:has(.btn_cancel) a.btn_register');
    if (!submitButton) {
      return { accountId: id, success: false, error: '대댓글 등록 버튼을 찾을 수 없습니다.' };
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    const errorMessage = await checkErrorPopup(page);
    if (errorMessage) {
      return { accountId: id, success: false, error: errorMessage };
    }

    const replyInputAfter = await page.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');
    const inputClosed = !replyInputAfter;
    const contentPreview = content.slice(0, 15);

    if (!inputClosed) {
      let replyFound = false;
      const replyAreas = await page.$$('.comment_area');
      for (const area of replyAreas) {
        const text = await area.textContent();
        if (text?.includes(contentPreview)) {
          replyFound = true;
          break;
        }
      }

      if (!replyFound) {
        await page.waitForTimeout(2000);
        const replyAreasRetry = await page.$$('.comment_area');
        for (const area of replyAreasRetry) {
          const text = await area.textContent();
          if (text?.includes(contentPreview)) {
            replyFound = true;
            break;
          }
        }

        if (!replyFound) {
          return { accountId: id, success: false, error: '대댓글이 등록되지 않음 (목록에서 확인 불가)' };
        }
      }
    }

    const commentAreas = await page.$$('.comment_area');
    if (commentAreas[targetIndex]) {
      const commentLikeButton = await commentAreas[targetIndex].$('a.u_likeit_list_btn._button');
      if (commentLikeButton) {
        const isCommentLiked = await commentLikeButton.evaluate(
          (el) => el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true'
        );
        if (!isCommentLiked) {
          await commentLikeButton.click();
          console.log(`[DEBUG] ${id} 댓글 좋아요 클릭 (index: ${targetIndex})`);
          await page.waitForTimeout(500);
        }
      }
    }

    const likeButton = await page.$('a.u_likeit_list_btn._button[data-type="like"]');
    if (likeButton) {
      const isLiked = await likeButton.evaluate(
        (el) => el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true'
      );
      if (!isLiked) {
        await likeButton.click();
        console.log(`[DEBUG] ${id} 글 좋아요 클릭`);
        await page.waitForTimeout(500);
      }
    }

    await saveCookiesForAccount(id);
    await incrementActivity(id, cafeId, 'replies');
    await incrementActivity(id, cafeId, 'likes');

    return { accountId: id, success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { accountId: id, success: false, error: errorMsg };
  } finally {
    releaseAccountLock(id);
  }
}
