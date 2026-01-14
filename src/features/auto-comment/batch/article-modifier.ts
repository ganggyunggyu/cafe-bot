import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';

export interface ModifyArticleInput {
  cafeId: string;
  articleId: number;
  newTitle: string;
  newContent: string;
  category?: string; // 게시판명 (미지정 시 카테고리 변경 안함)
}

export interface ModifyResult {
  success: boolean;
  articleId: number;
  modifierAccountId: string;
  error?: string;
}

export const modifyArticleWithAccount = async (
  account: NaverAccount,
  input: ModifyArticleInput
): Promise<ModifyResult> => {
  const { id, password } = account;
  const { cafeId, articleId, newTitle, newContent, category } = input;

  // 계정 락 획득 (동시 접근 방지)
  await acquireAccountLock(id);

  try {
    const loggedIn = await isAccountLoggedIn(id);

    if (!loggedIn) {
      const loginResult = await loginAccount(id, password);
      if (!loginResult.success) {
        return {
          success: false,
          articleId,
          modifierAccountId: id,
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(id);

    // 글 수정 페이지로 이동
    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}/modify`;
    console.log('[DEBUG] 수정 페이지 이동:', modifyUrl);

    await page.goto(modifyUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);

    // 카테고리 변경 (지정된 경우에만)
    if (category) {
      const boardSelectButton = await page.$('.FormSelectButton button.button');
      if (boardSelectButton) {
        await boardSelectButton.click();
        await page.waitForTimeout(500);

        const options = await page.$$('ul.option_list li.item button.option');
        let found = false;

        for (const option of options) {
          const text = await option.textContent();
          if (text?.trim() === category) {
            await option.click();
            found = true;
            console.log(`[DEBUG] 카테고리 "${category}"로 변경됨`);
            break;
          }
        }

        if (!found) {
          console.log(`[DEBUG] 카테고리 "${category}" 없음, 기존 카테고리 유지`);
          // 드롭다운 닫기 (ESC 키)
          await page.keyboard.press('Escape');
        }

        await page.waitForTimeout(500);
      }
    }

    // 제목 입력창 찾기 및 수정
    const titleInput = await page.$('.FlexableTextArea textarea.textarea_input, textarea.textarea_input');

    if (!titleInput) {
      return {
        success: false,
        articleId,
        modifierAccountId: id,
        error: '제목 입력창을 찾을 수 없습니다. 수정 권한이 없을 수 있습니다.',
      };
    }

    // 기존 제목 지우고 새 제목 입력
    await titleInput.click({ clickCount: 3 }); // 전체 선택
    await page.waitForTimeout(200);
    await titleInput.fill(newTitle);
    await page.waitForTimeout(500);

    // 본문 입력 영역 찾기
    const contentArea = await page.$('p.se-text-paragraph');

    if (!contentArea) {
      return {
        success: false,
        articleId,
        modifierAccountId: id,
        error: '본문 입력창을 찾을 수 없습니다.',
      };
    }

    // 기존 본문 전체 선택 후 삭제
    await contentArea.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // 새 본문 입력
    const plainContent = newContent
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '');

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

    // 수정 완료 버튼 클릭
    const submitButton = await page.$('a.BaseButton--skinGreen, a.BaseButton');

    if (!submitButton) {
      return {
        success: false,
        articleId,
        modifierAccountId: id,
        error: '수정 완료 버튼을 찾을 수 없습니다.',
      };
    }

    await submitButton.click();

    // 수정 완료 후 글 상세 페이지로 리다이렉트 대기
    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
      console.log('[DEBUG] 수정 완료, URL 변화 감지됨');
    } catch {
      console.log('[DEBUG] URL 변화 없음, 추가 대기...');
      await page.waitForTimeout(3000);
    }

    await saveCookiesForAccount(id);

    return {
      success: true,
      articleId,
      modifierAccountId: id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      success: false,
      articleId,
      modifierAccountId: id,
      error: errorMessage,
    };
  } finally {
    releaseAccountLock(id);
  }
}
