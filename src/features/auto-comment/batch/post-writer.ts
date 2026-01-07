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
}

export async function writePostWithAccount(
  account: NaverAccount,
  input: WritePostInput
): Promise<PostResult> {
  const { id, password } = account;
  const { cafeId, menuId, subject, content } = input;

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

    // 게시판 선택 (드롭다운 클릭 → 첫 번째 옵션 선택)
    const boardSelectButton = await page.$('.FormSelectButton button.button');
    if (boardSelectButton) {
      await boardSelectButton.click();
      await page.waitForTimeout(500);

      // 첫 번째 게시판 옵션 클릭
      const firstBoardOption = await page.$('ul.option_list li.item button.option');
      if (firstBoardOption) {
        await firstBoardOption.click();
        await page.waitForTimeout(500);
      }
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

    const articleIdMatch = currentUrl.match(/articles\/(\d+)/);
    let articleId = articleIdMatch ? parseInt(articleIdMatch[1], 10) : undefined;
    console.log('[DEBUG] URL에서 추출한 articleId:', articleId);

    // articleId 못 찾으면 페이지에서 직접 추출 시도
    if (!articleId) {
      console.log('[DEBUG] URL에서 articleId 못 찾음, 페이지에서 추출 시도...');

      // 방법 1: 일반 article 링크
      const articleLink = await page.$('a[href*="/articles/"]');
      if (articleLink) {
        const href = await articleLink.getAttribute('href');
        console.log('[DEBUG] 찾은 article 링크:', href);
        const match = href?.match(/articles\/(\d+)/);
        if (match) {
          articleId = parseInt(match[1], 10);
        }
      }

      // 방법 2: 성공 모달이나 알림에서 찾기
      if (!articleId) {
        const successModal = await page.$('.success_message, .complete_message, .alert_layer');
        if (successModal) {
          const modalText = await successModal.textContent();
          console.log('[DEBUG] 성공 모달 텍스트:', modalText);
        }
      }

      // 방법 3: 현재 페이지 전체 HTML에서 articleId 패턴 찾기
      if (!articleId) {
        const pageContent = await page.content();
        const articleMatch = pageContent.match(/articleId["\s:=]+(\d+)/i);
        if (articleMatch) {
          articleId = parseInt(articleMatch[1], 10);
          console.log('[DEBUG] HTML에서 찾은 articleId:', articleId);
        }
      }
    }

    console.log('[DEBUG] 최종 articleId:', articleId);

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
