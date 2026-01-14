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

export const writeCommentWithAccount = async (
  account: NaverAccount,
  cafeId: string,
  articleId: number,
  content: string
): Promise<WriteCommentResult> => {
  const { id, password } = account;

  // 계정 락 획득 (동시 접근 방지)
  await acquireAccountLock(id);

  try {
    const loggedIn = await isAccountLoggedIn(id);

    if (!loggedIn) {
      const loginResult = await loginAccount(id, password);
      if (!loginResult.success) {
        return {
          accountId: id,
          success: false,
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(id);

    // 새 URL 형식 사용
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    await page.goto(articleUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // 로그인 페이지로 리다이렉트됐는지 확인
    const currentUrlAfterNav = page.url();
    if (isLoginRedirect(currentUrlAfterNav)) {
      console.log(`[COMMENT] ${id} 세션 만료 감지 - 재로그인 시도`);
      invalidateLoginCache(id);

      const reloginResult = await loginAccount(id, password);
      if (!reloginResult.success) {
        return {
          accountId: id,
          success: false,
          error: `세션 만료 후 재로그인 실패: ${reloginResult.error}`,
        };
      }

      // 다시 글 페이지로 이동
      await page.goto(articleUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    }

    // 글이 존재하는지 확인 (삭제됨/비공개 체크)
    const notFoundIndicator = await page.$('.error_content, .deleted_article, .no_article');
    if (notFoundIndicator) {
      return {
        accountId: id,
        success: false,
        error: 'ARTICLE_NOT_READY:글이 아직 처리 중이거나 삭제됨',
      };
    }

    // 댓글 입력창 대기 (최대 10초)
    let commentInput = null;
    try {
      commentInput = await page.waitForSelector('textarea.comment_inbox_text', { timeout: 10000 });
    } catch {
      // iframe 안에 있을 수도 있음
      const frameHandle = await page.$('iframe#cafe_main');
      if (frameHandle) {
        const frame = await frameHandle.contentFrame();
        if (frame) {
          try {
            commentInput = await frame.waitForSelector('textarea.comment_inbox_text', { timeout: 5000 });
          } catch {
            // iframe에서도 못 찾음
          }
        }
      }
    }

    if (!commentInput) {
      // 디버그: 현재 URL 로깅
      console.log(`[COMMENT] ${id} 댓글 입력창 없음 - URL: ${page.url()}`);
      return {
        accountId: id,
        success: false,
        error: 'ARTICLE_NOT_READY:댓글 입력창을 찾을 수 없습니다. 글이 아직 처리 중일 수 있습니다.',
      };
    }

    // 입력창 클릭 후 텍스트 입력
    await commentInput.click();
    await page.waitForTimeout(500);
    await commentInput.fill(content);
    await page.waitForTimeout(500);

    // 등록 버튼: a.btn_register
    let submitButton = await page.$('a.btn_register');

    // iframe 안에 있을 수도 있음
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
      return {
        accountId: id,
        success: false,
        error: '등록 버튼(a.btn_register)을 찾을 수 없습니다.',
      };
    }

    await submitButton.click();
    await page.waitForTimeout(1500);

    // 에러 팝업 확인 (권한 없음 등)
    const errorPopup = await page.$('.LayerPopup, .popup_layer, [role="alertdialog"]');
    if (errorPopup) {
      const errorText = await errorPopup.textContent();
      if (errorText?.includes('권한') || errorText?.includes('없습니다')) {
        return {
          accountId: id,
          success: false,
          error: errorText.trim().slice(0, 100) || '권한 에러',
        };
      }
    }

    // 댓글 목록에서 방금 작성한 내용 확인
    const commentAreas = await page.$$('.comment_area');
    let found = false;
    const contentPreview = content.slice(0, 15);

    for (const area of commentAreas) {
      const text = await area.textContent();
      if (text?.includes(contentPreview)) {
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        accountId: id,
        success: false,
        error: '댓글이 등록되지 않음 (목록에서 확인 불가)',
      };
    }

    await saveCookiesForAccount(id);

    // 활동 기록
    await incrementActivity(id, cafeId, 'comments');

    return { accountId: id, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      accountId: id,
      success: false,
      error: errorMessage,
    };
  } finally {
    releaseAccountLock(id);
  }
}

// 대댓글 작성 함수
export const writeReplyWithAccount = async (
  account: NaverAccount,
  cafeId: string,
  articleId: number,
  content: string,
  commentIndex: number = 0 // 몇 번째 댓글에 대댓글 달지 (0부터 시작)
): Promise<WriteCommentResult> => {
  const { id, password } = account;

  // 계정 락 획득 (동시 접근 방지)
  await acquireAccountLock(id);

  try {
    const loggedIn = await isAccountLoggedIn(id);

    if (!loggedIn) {
      const loginResult = await loginAccount(id, password);
      if (!loginResult.success) {
        return {
          accountId: id,
          success: false,
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(id);
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    await page.goto(articleUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // 로그인 페이지로 리다이렉트됐는지 확인
    const currentUrlAfterNav = page.url();
    if (isLoginRedirect(currentUrlAfterNav)) {
      console.log(`[REPLY] ${id} 세션 만료 감지 - 재로그인 시도`);
      invalidateLoginCache(id);

      const reloginResult = await loginAccount(id, password);
      if (!reloginResult.success) {
        return {
          accountId: id,
          success: false,
          error: `세션 만료 후 재로그인 실패: ${reloginResult.error}`,
        };
      }

      // 다시 글 페이지로 이동
      await page.goto(articleUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
    }

    await page.waitForTimeout(1500);

    // N번째 댓글의 "답글쓰기" 버튼 찾기
    const replyButtons = await page.$$('a.comment_info_button');

    if (replyButtons.length === 0) {
      console.log(`[REPLY] ${id} 답글쓰기 버튼 없음 - URL: ${page.url()}`);
      return {
        accountId: id,
        success: false,
        error: 'ARTICLE_NOT_READY:답글쓰기 버튼을 찾을 수 없습니다. 댓글이 아직 없을 수 있습니다.',
      };
    }

    // 인덱스가 범위를 벗어나면 마지막 댓글에 대댓글 달기 (댓글 job 실패 등으로 인한 케이스)
    let targetIndex = commentIndex;
    if (targetIndex >= replyButtons.length) {
      console.log(`[REPLY] ${id} 대댓글 인덱스 ${targetIndex} → ${replyButtons.length - 1}로 조정 (총 ${replyButtons.length}개 댓글)`);
      targetIndex = replyButtons.length - 1;
    }

    // 답글쓰기 버튼 클릭
    await replyButtons[targetIndex].click();
    await page.waitForTimeout(1000);

    // 대댓글 입력창 찾기 (취소 버튼이 있는 CommentWriter 내의 textarea)
    const replyInput = await page.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');

    if (!replyInput) {
      return {
        accountId: id,
        success: false,
        error: 'ARTICLE_NOT_READY:대댓글 입력창을 찾을 수 없습니다.',
      };
    }

    await replyInput.click();
    await page.waitForTimeout(500);
    await replyInput.fill(content);
    await page.waitForTimeout(500);

    // 대댓글 등록 버튼 (취소 버튼 옆에 있는 등록 버튼)
    const submitButton = await page.$('.CommentWriter:has(.btn_cancel) a.btn_register');

    if (!submitButton) {
      return {
        accountId: id,
        success: false,
        error: '대댓글 등록 버튼을 찾을 수 없습니다.',
      };
    }

    await submitButton.click();
    await page.waitForTimeout(1500);

    // 에러 팝업 확인 (권한 없음 등)
    const errorPopup = await page.$('.LayerPopup, .popup_layer, [role="alertdialog"]');
    if (errorPopup) {
      const errorText = await errorPopup.textContent();
      if (errorText?.includes('권한') || errorText?.includes('없습니다')) {
        return {
          accountId: id,
          success: false,
          error: errorText.trim().slice(0, 100) || '권한 에러',
        };
      }
    }

    // 대댓글 목록에서 방금 작성한 내용 확인
    const replyAreas = await page.$$('.comment_area');
    let replyFound = false;
    const contentPreview = content.slice(0, 15);

    for (const area of replyAreas) {
      const text = await area.textContent();
      if (text?.includes(contentPreview)) {
        replyFound = true;
        break;
      }
    }

    if (!replyFound) {
      return {
        accountId: id,
        success: false,
        error: '대댓글이 등록되지 않음 (목록에서 확인 불가)',
      };
    }

    // 해당 댓글 좋아요 (대댓글 단 댓글에 공감)
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

    // 글 좋아요 (이미 눌렀으면 스킵)
    const likeButton = await page.$('a.u_likeit_list_btn._button[data-type="like"]');
    if (likeButton) {
      const isLiked = await likeButton.evaluate((el) =>
        el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true'
      );

      if (!isLiked) {
        await likeButton.click();
        console.log(`[DEBUG] ${id} 글 좋아요 클릭`);
        await page.waitForTimeout(500);
      }
    }

    await saveCookiesForAccount(id);

    // 활동 기록 (대댓글 + 좋아요)
    await incrementActivity(id, cafeId, 'replies');
    await incrementActivity(id, cafeId, 'likes');

    return { accountId: id, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      accountId: id,
      success: false,
      error: errorMessage,
    };
  } finally {
    releaseAccountLock(id);
  }
}
