import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import type { PostResult } from './types';

export interface WritePostInput {
  cafeId: string;
  menuId: string;
  subject: string;
  content: string;
  category?: string; // 게시판명 (미지정 시 첫 번째 게시판)
}

export const writePostWithAccount = async (
  account: NaverAccount,
  input: WritePostInput
): Promise<PostResult> => {
  const { id, password } = account;
  const { cafeId, menuId, subject, content, category } = input;

  try {
    const loggedIn = await isAccountLoggedIn(id);

    if (!loggedIn) {
      const loginResult = await loginAccount(id, password);
      if (!loginResult.success) {
        return {
          success: false,
          writerAccountId: id,
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(id);

    // 글쓰기 페이지로 이동
    const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/write?boardType=L&menuId=${menuId}`;

    await page.goto(writeUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    // 게시판 선택 (드롭다운 클릭 → 카테고리 선택)
    const boardSelectButton = await page.$('.FormSelectButton button.button');
    if (boardSelectButton) {
      await boardSelectButton.click();
      await page.waitForTimeout(500);

      if (category) {
        // 특정 카테고리명으로 선택
        const options = await page.$$('ul.option_list li.item button.option');
        let found = false;

        for (const option of options) {
          const text = await option.textContent();
          if (text?.trim() === category) {
            await option.click();
            found = true;
            console.log(`[DEBUG] 카테고리 "${category}" 선택됨`);
            break;
          }
        }

        if (!found) {
          // 카테고리를 찾지 못하면 첫 번째 선택
          console.log(`[DEBUG] 카테고리 "${category}" 없음, 첫 번째 선택`);
          const firstOption = await page.$('ul.option_list li.item button.option');
          if (firstOption) {
            await firstOption.click();
          }
        }
      } else {
        // 카테고리 미지정 시 첫 번째 게시판 선택
        const firstBoardOption = await page.$('ul.option_list li.item button.option');
        if (firstBoardOption) {
          await firstBoardOption.click();
        }
      }

      await page.waitForTimeout(500);
    }

    // 제목 입력 (.FlexableTextArea textarea.textarea_input)
    const titleInput = await page.$('.FlexableTextArea textarea.textarea_input, textarea.textarea_input');

    if (!titleInput) {
      return {
        success: false,
        writerAccountId: id,
        error: '제목 입력창을 찾을 수 없어. 카페 가입이 필요할 수 있어.',
      };
    }

    await titleInput.click();
    await page.waitForTimeout(300);
    await titleInput.fill(subject);
    await page.waitForTimeout(500);

    // 본문 입력 (SmartEditor - p.se-text-paragraph 클릭 후 타이핑)
    const contentArea = await page.$('p.se-text-paragraph');

    if (!contentArea) {
      return {
        success: false,
        writerAccountId: id,
        error: '본문 입력창을 찾을 수 없어.',
      };
    }

    await contentArea.click();
    await page.waitForTimeout(500);

    // HTML 태그를 plain text로 변환 (<br> → 줄바꿈)
    const plainContent = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '');

    // SmartEditor는 contenteditable이므로 줄바꿈은 Enter 키로 처리
    const lines = plainContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        await page.keyboard.type(lines[i], { delay: 5 });
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Enter');
      }
    }

    await page.waitForTimeout(500);

    // 등록 버튼 클릭 (a.BaseButton--skinGreen)
    const submitButton = await page.$('a.BaseButton--skinGreen, a.BaseButton');

    if (!submitButton) {
      return {
        success: false,
        writerAccountId: id,
        error: '등록 버튼을 찾을 수 없어.',
      };
    }

    await submitButton.click();

    // 글 작성 후 URL 변화 대기 (글 상세 페이지로 리다이렉트)
    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
      console.log('[DEBUG] URL 변화 감지됨');
    } catch {
      // URL 변화 없으면 추가 대기
      console.log('[DEBUG] URL 변화 없음, 추가 대기...');
      await page.waitForTimeout(3000);
    }

    // 글 작성 후 URL에서 articleId 추출 시도
    const currentUrl = page.url();
    console.log('[DEBUG] 현재 URL:', currentUrl);

    // URL 디코딩 (네이버 카페는 iframe_url_utf8 파라미터에 인코딩된 URL 사용)
    const decodedUrl = decodeURIComponent(decodeURIComponent(currentUrl));
    console.log('[DEBUG] 디코딩된 URL:', decodedUrl);

    // articleid=숫자 패턴으로 추출 (네이버 카페 URL 형식)
    const articleIdMatch = decodedUrl.match(/articleid=(\d+)/i);
    let articleId = articleIdMatch ? parseInt(articleIdMatch[1], 10) : undefined;
    console.log('[DEBUG] URL에서 추출한 articleId:', articleId);

    await saveCookiesForAccount(id);

    return {
      success: true,
      writerAccountId: id,
      articleId,
      articleUrl: currentUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      success: false,
      writerAccountId: id,
      error: errorMessage,
    };
  }
}
