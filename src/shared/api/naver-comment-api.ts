import { getPage, saveCookies, isLoggedIn } from '@/shared/lib/playwright';

export interface CommentRequest {
  cafeId: string;
  articleId: number;
  content: string;
}

export interface ReplyRequest extends CommentRequest {
  parentCommentId: string;
}

export interface CommentResult {
  success: boolean;
  error?: string;
}

const ensureLoggedIn = async (): Promise<boolean> => {
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    throw new Error('네이버 로그인이 필요합니다. 먼저 로그인해주세요.');
  }
  return true;
}

export const writeComment = async (request: CommentRequest): Promise<CommentResult> => {
  const { cafeId, articleId, content } = request;

  try {
    await ensureLoggedIn();

    const page = await getPage();
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    await page.goto(articleUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    const frameHandle = await page.waitForSelector('iframe#cafe_main', { timeout: 10000 });
    const frame = await frameHandle?.contentFrame();

    if (!frame) {
      throw new Error('카페 프레임을 찾을 수 없습니다.');
    }

    const commentInput = await frame.waitForSelector(
      'textarea.comment_inbox_text, div.comment_write textarea, textarea[placeholder*="댓글"]',
      { timeout: 10000 }
    );

    if (!commentInput) {
      throw new Error('댓글 입력창을 찾을 수 없습니다.');
    }

    await commentInput.click();
    await commentInput.fill(content);

    const submitButton = await frame.waitForSelector(
      'button.btn_register, a.btn_register, button:has-text("등록")',
      { timeout: 5000 }
    );

    if (!submitButton) {
      throw new Error('등록 버튼을 찾을 수 없습니다.');
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    await saveCookies();

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

export const writeReply = async (request: ReplyRequest): Promise<CommentResult> => {
  const { cafeId, articleId, content, parentCommentId } = request;

  try {
    await ensureLoggedIn();

    const page = await getPage();
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    await page.goto(articleUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    const frameHandle = await page.waitForSelector('iframe#cafe_main', { timeout: 10000 });
    const frame = await frameHandle?.contentFrame();

    if (!frame) {
      throw new Error('카페 프레임을 찾을 수 없습니다.');
    }

    const replyButton = await frame.waitForSelector(
      `[data-comment-id="${parentCommentId}"] button.btn_reply, ` +
        `li[id*="${parentCommentId}"] a.conn_reply, ` +
        `div[data-id="${parentCommentId}"] button:has-text("답글")`,
      { timeout: 10000 }
    );

    if (!replyButton) {
      throw new Error('답글 버튼을 찾을 수 없습니다.');
    }

    await replyButton.click();
    await page.waitForTimeout(1000);

    const replyInput = await frame.waitForSelector(
      'textarea.reply_inbox_text, div.reply_write textarea, textarea[placeholder*="답글"]',
      { timeout: 10000 }
    );

    if (!replyInput) {
      throw new Error('대댓글 입력창을 찾을 수 없습니다.');
    }

    await replyInput.click();
    await replyInput.fill(content);

    const submitButton = await frame.waitForSelector(
      'div.reply_write button.btn_register, button:has-text("등록"):visible',
      { timeout: 5000 }
    );

    if (!submitButton) {
      throw new Error('등록 버튼을 찾을 수 없습니다.');
    }

    await submitButton.click();
    await page.waitForTimeout(2000);

    await saveCookies();

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}

export const naverLogin = async (id: string, password: string): Promise<CommentResult> => {
  try {
    const page = await getPage();

    await page.goto('https://nid.naver.com/nidlogin.login', {
      waitUntil: 'networkidle',
    });

    await page.fill('input#id', id);
    await page.fill('input#pw', password);

    await page.click('button.btn_login, button#log\\.login');

    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin.login')) {
      throw new Error('로그인 실패. ID/PW를 확인해주세요.');
    }

    await saveCookies();

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return { success: false, error: errorMessage };
  }
}
