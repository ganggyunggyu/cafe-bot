import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';

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
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    // 댓글 입력창 찾기: textarea.comment_inbox_text
    let commentInput = await page.$('textarea.comment_inbox_text');

    // iframe 안에 있을 수도 있음
    if (!commentInput) {
      const frameHandle = await page.$('iframe#cafe_main');
      if (frameHandle) {
        const frame = await frameHandle.contentFrame();
        if (frame) {
          commentInput = await frame.$('textarea.comment_inbox_text');
        }
      }
    }

    if (!commentInput) {
      return {
        accountId: id,
        success: false,
        error: '댓글 입력창(textarea.comment_inbox_text)을 찾을 수 없어.',
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
        error: '등록 버튼(a.btn_register)을 찾을 수 없어.',
      };
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    await saveCookiesForAccount(id);

    return { accountId: id, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      accountId: id,
      success: false,
      error: errorMessage,
    };
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
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    // N번째 댓글의 "답글쓰기" 버튼 찾기
    const replyButtons = await page.$$('a.comment_info_button');

    if (replyButtons.length === 0) {
      return {
        accountId: id,
        success: false,
        error: '답글쓰기 버튼을 찾을 수 없어.',
      };
    }

    if (commentIndex >= replyButtons.length) {
      return {
        accountId: id,
        success: false,
        error: `${commentIndex}번째 댓글이 없어. (총 ${replyButtons.length}개 댓글)`,
      };
    }

    // 답글쓰기 버튼 클릭
    await replyButtons[commentIndex].click();
    await page.waitForTimeout(1000);

    // 대댓글 입력창 찾기 (취소 버튼이 있는 CommentWriter 내의 textarea)
    const replyInput = await page.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');

    if (!replyInput) {
      return {
        accountId: id,
        success: false,
        error: '대댓글 입력창을 찾을 수 없어.',
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
        error: '대댓글 등록 버튼을 찾을 수 없어.',
      };
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    await saveCookiesForAccount(id);

    return { accountId: id, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      accountId: id,
      success: false,
      error: errorMessage,
    };
  }
}
