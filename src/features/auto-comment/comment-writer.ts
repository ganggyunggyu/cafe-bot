import type { ElementHandle, Frame, Page } from 'playwright';
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
  commentId?: string;
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

const waitForCommentItem = async (
  root: Page | Frame,
  timeout: number
): Promise<boolean> => {
  try {
    await root.waitForSelector('.CommentItem', { timeout });
    return true;
  } catch {
    return false;
  }
};

const getCommentRoot = async (page: Page): Promise<Page | Frame> => {
  const frameHandle = await page.$('iframe#cafe_main');
  const frame = await frameHandle?.contentFrame();
  if (frame) {
    const frameReady = await waitForCommentItem(frame, 5000);
    if (frameReady) return frame;
  }

  await waitForCommentItem(page, 3000);
  return page;
};

const getClosestCommentItem = async (
  node: ElementHandle<Element>
): Promise<ElementHandle<HTMLElement> | null> => {
  const handle = await node.evaluateHandle((el) => el.closest('.CommentItem'));
  const element = handle.asElement();
  return element ? (element as ElementHandle<HTMLElement>) : null;
};

const findCommentItemById = async (
  root: Page | Frame,
  commentId: string
): Promise<ElementHandle<HTMLElement> | null> => {
  const safeId = commentId.replace(/"/g, '\\"');
  const direct = await root.$(`li[id="${safeId}"]`);
  if (direct) return direct as ElementHandle<HTMLElement>;

  const dataId = await root.$(`[data-comment-id="${safeId}"]`);
  if (dataId) {
    const closest = await getClosestCommentItem(dataId);
    if (closest) return closest;
  }

  const likeCid = await root.$(`[data-cid$="-${safeId}"]`);
  if (likeCid) {
    const closest = await getClosestCommentItem(likeCid);
    if (closest) return closest;
  }

  const buttonNode = await root.$(`button#commentItem${safeId}`);
  if (buttonNode) {
    const closest = await getClosestCommentItem(buttonNode);
    if (closest) return closest;
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

    const root = await getCommentRoot(page);

    // 대댓글 입력창이 열려있으면 닫기 (취소 버튼 클릭)
    const openReplyCancel = await root.$('.CommentWriter:has(.btn_cancel) a.btn_cancel');
    if (openReplyCancel) {
      console.log(`[COMMENT] ${id} 열린 대댓글 입력창 닫기`);
      await openReplyCancel.click();
      await page.waitForTimeout(500);
    }

    // 댓글 입력창 셀렉터: btn_cancel이 없는 CommentWriter (대댓글 제외)
    const commentInputSelector = '.CommentWriter:not(:has(.btn_cancel)) textarea.comment_inbox_text';
    let commentInput = await root.$(commentInputSelector);

    if (!commentInput) {
      try {
        commentInput = await root.waitForSelector(commentInputSelector, { timeout: 5000 });
      } catch {}
    }

    if (!commentInput) {
      console.log(`[COMMENT] ${id} 댓글 입력창 없음 - URL: ${page.url()}`);
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:댓글 입력창을 찾을 수 없습니다. 글이 아직 처리 중일 수 있습니다.' };
    }

    await commentInput.click();
    await page.waitForTimeout(500);
    await commentInput.fill(content);
    await page.waitForTimeout(500);

    // 댓글 등록 버튼 셀렉터: btn_cancel이 없는 CommentWriter (대댓글 제외)
    const submitButtonSelector = '.CommentWriter:not(:has(.btn_cancel)) a.btn_register';
    const submitButton = await root.$(submitButtonSelector);

    if (!submitButton) {
      return { accountId: id, success: false, error: '등록 버튼(a.btn_register)을 찾을 수 없습니다.' };
    }

    await submitButton.click();
    await page.waitForTimeout(1500);

    const errorMessage = await checkErrorPopup(page);
    if (errorMessage) {
      return { accountId: id, success: false, error: errorMessage };
    }

    const normalizeText = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();
    const getItemText = async (
      item: ElementHandle<SVGElement | HTMLElement>,
      selector: string
    ): Promise<string> => {
      try {
        return await item.$eval(selector, (el) => el.textContent || '');
      } catch {
        return '';
      }
    };
    const getCommentIdFromItem = async (
      item: ElementHandle<HTMLElement>
    ): Promise<string | undefined> => {
      const idAttr = await item.getAttribute('id');
      if (idAttr) return idAttr;

      const dataId = await item.getAttribute('data-comment-id');
      if (dataId) return dataId;

      try {
        const buttonId = await item.$eval('button[id^="commentItem"]', (el) => el.id);
        if (buttonId) return buttonId.replace('commentItem', '');
      } catch {}

      try {
        const cid = await item.$eval('[data-cid]', (el) => el.getAttribute('data-cid'));
        if (cid) {
          const parts = cid.split('-');
          return parts[parts.length - 1] || cid;
        }
      } catch {}

      return undefined;
    };

    const commentItems = await root.$$('.CommentItem:not(.CommentItem--reply)');
    const contentPreview = normalizeText(content).slice(0, 30);
    const commenterNickname = normalizeText(account.nickname || account.id);
    let found = false;
    let commentId: string | undefined;

    for (const item of commentItems) {
      const commentText = normalizeText(await getItemText(item, '.comment_text_view'));
      if (!commentText.includes(contentPreview)) continue;

      if (commenterNickname) {
        const commentNickname = normalizeText(await getItemText(item, '.comment_nickname'));
        if (commentNickname && commentNickname !== commenterNickname) continue;
      }

      found = true;
      commentId = await getCommentIdFromItem(item as ElementHandle<HTMLElement>);
      break;
    }

    if (!found) {
      return { accountId: id, success: false, error: '댓글이 등록되지 않음 (목록에서 확인 불가)' };
    }

    await saveCookiesForAccount(id);
    await incrementActivity(id, cafeId, 'comments');

    return { accountId: id, success: true, commentId };
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
  commentIndex: number = 0,
  options?: {
    parentCommentId?: string;
    parentComment?: string;
    parentNickname?: string;
  }
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

    const { parentCommentId, parentComment, parentNickname } = options ?? {};
    const normalizeText = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();
    const getItemText = async (
      item: ElementHandle<SVGElement | HTMLElement>,
      selector: string
    ): Promise<string> => {
      try {
        return await item.$eval(selector, (el) => el.textContent || '');
      } catch {
        return '';
      }
    };

    const root = await getCommentRoot(page);
    let targetItem: ElementHandle<HTMLElement> | null = null;
    let targetIndex = -1;

    if (parentCommentId) {
      targetItem = await findCommentItemById(root, parentCommentId);
    }

    if (!targetItem) {
      const commentItems = await root.$$('.CommentItem:not(.CommentItem--reply)');
      if (commentItems.length === 0) {
        console.log(`[REPLY] ${id} 답글쓰기 버튼 없음 - URL: ${page.url()}`);
        return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:답글쓰기 버튼을 찾을 수 없습니다. 댓글이 아직 없을 수 있습니다.' };
      }

      console.log(`[REPLY] ${id} 메인 댓글 ${commentItems.length}개 발견, 타겟 인덱스: ${commentIndex}`);

      const targetCommentText = normalizeText(parentComment);
      const targetCommentPreview = targetCommentText ? targetCommentText.slice(0, 40) : '';
      const targetNickname = normalizeText(parentNickname);

      if (!targetCommentPreview && targetNickname && commentIndex >= 0 && commentIndex < commentItems.length) {
        const indexedNickname = normalizeText(await getItemText(commentItems[commentIndex], '.comment_nickname'));
        if (indexedNickname === targetNickname) {
          targetIndex = commentIndex;
        }
      }

      if (targetIndex < 0 && (targetCommentPreview || targetNickname)) {
        for (let i = 0; i < commentItems.length; i++) {
          const item = commentItems[i];
          const commentText = normalizeText(await getItemText(item, '.comment_text_view'));
          const commentNickname = normalizeText(await getItemText(item, '.comment_nickname'));
          const textMatches = targetCommentPreview ? commentText.includes(targetCommentPreview) : true;
          const nicknameMatches = targetNickname ? commentNickname === targetNickname : true;

          if (textMatches && nicknameMatches) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex < 0) {
        targetIndex = commentIndex;
        if (targetIndex >= commentItems.length) {
          console.log(`[REPLY] ${id} 대댓글 인덱스 ${targetIndex} → ${commentItems.length - 1}로 조정`);
          targetIndex = commentItems.length - 1;
        }
      }

      targetItem = commentItems[targetIndex] as ElementHandle<HTMLElement>;
    }

    const replyButton = await targetItem?.$('a.comment_info_button');
    if (!replyButton) {
      return { accountId: id, success: false, error: '답글쓰기 버튼을 찾을 수 없습니다.' };
    }

    await replyButton.click();
    await page.waitForTimeout(1000);

    const replyInput = await root.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');
    if (!replyInput) {
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:대댓글 입력창을 찾을 수 없습니다.' };
    }

    await replyInput.click();
    await page.waitForTimeout(500);
    await replyInput.fill(content);
    await page.waitForTimeout(500);

    const submitButton = await root.$('.CommentWriter:has(.btn_cancel) a.btn_register');
    if (!submitButton) {
      return { accountId: id, success: false, error: '대댓글 등록 버튼을 찾을 수 없습니다.' };
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    const errorMessage = await checkErrorPopup(page);
    if (errorMessage) {
      return { accountId: id, success: false, error: errorMessage };
    }

    const replyInputAfter = await root.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');
    const inputClosed = !replyInputAfter;
    const contentPreview = content.slice(0, 15);

    if (!inputClosed) {
      let replyFound = false;
      const replyAreas = await root.$$('.comment_area');
      for (const area of replyAreas) {
        const text = await area.textContent();
        if (text?.includes(contentPreview)) {
          replyFound = true;
          break;
        }
      }

      if (!replyFound) {
        await page.waitForTimeout(2000);
        const replyAreasRetry = await root.$$('.comment_area');
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

    if (targetItem) {
      const commentLikeButton = await targetItem.$('a.u_likeit_list_btn._button');
      if (commentLikeButton) {
        const isCommentLiked = await commentLikeButton.evaluate(
          (el) => el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true'
        );
        if (!isCommentLiked) {
          await commentLikeButton.click();
          const indexLabel = targetIndex >= 0 ? ` (index: ${targetIndex})` : '';
          console.log(`[DEBUG] ${id} 댓글 좋아요 클릭${indexLabel}`);
          await page.waitForTimeout(500);
        }
      }
    }

    let likeButton = await root.$('a.u_likeit_list_btn._button[data-type="like"]');
    if (!likeButton) {
      likeButton = await page.$('a.u_likeit_list_btn._button[data-type="like"]');
    }
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
