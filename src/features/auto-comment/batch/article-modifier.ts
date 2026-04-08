import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import { uploadImages, uploadSingleImage } from './image-uploader';

// 부제 패턴 (숫자. 형식)
const SUBTITLE_PATTERN = /^\d+\.\s*/;

export interface ModifyArticleInput {
  cafeId: string;
  articleId: number;
  newTitle: string;
  newContent: string;
  category?: string; // 게시판명 (미지정 시 카테고리 변경 안함)
  images?: string[]; // Base64 이미지 배열
  enableComments?: boolean; // true: 댓글 허용으로 변경
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
  const { cafeId, articleId, newTitle, newContent, category, images } = input;

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

    // JS dialog 자동 처리 (네이버 수정 페이지 alert/confirm 대응)
    page.on('dialog', async (dialog) => {
      try {
        await dialog.accept();
      } catch {}
    });

    // 글 수정 페이지로 이동
    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}/modify`;
    console.log('[DEBUG] 수정 페이지 이동:', modifyUrl);

    await page.goto(modifyUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // 에디터 로딩 대기
    try {
      await page.waitForSelector('p.se-text-paragraph, .FlexableTextArea textarea.textarea_input, .se-component-content', { timeout: 15000 });
    } catch {
      console.log('[DEBUG] 에디터 셀렉터 대기 실패, 스크린샷 촬영');
      await page.screenshot({ path: '/tmp/modify-debug.png', fullPage: true });
      console.log('[DEBUG] 현재 URL:', page.url());
      const title = await page.title();
      console.log('[DEBUG] 페이지 제목:', title);
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

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

    // 기존 본문 전체 선택 후 삭제 (macOS: Meta+A, Windows: Control+A)
    await contentArea.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+A');
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // 새 본문 입력 - HTML 태그를 plain text로 변환
    const plainContent = newContent
      .replace(/<\/p>\s*<p>/gi, '\n')  // </p><p> → 줄바꿈
      .replace(/<br\s*\/?>/gi, '\n')   // <br> → 줄바꿈
      .replace(/<[^>]*>/g, '')         // 나머지 태그 제거
      .trim();

    const lines = plainContent.split('\n');

    // 부제 위치 찾기 (숫자. 형식)
    const subtitleIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (SUBTITLE_PATTERN.test(lines[i].trim())) {
        subtitleIndices.push(i);
      }
    }

    // 이미지 삽입 위치 결정
    const imageQueue = images ? [...images] : [];
    const hasSubtitles = subtitleIndices.length > 0;

    console.log(`[MODIFY] 부제 ${subtitleIndices.length}개 발견, 이미지 ${imageQueue.length}장`);

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) {
        await page.keyboard.type(lines[i], { delay: 120 });
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Enter');
      }

      // 부제 다음에 이미지 삽입 (이미지가 남아있고, 현재 줄이 부제인 경우)
      if (hasSubtitles && imageQueue.length > 0 && subtitleIndices.includes(i)) {
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        const imageToUpload = imageQueue.shift();
        if (imageToUpload) {
          console.log(`[MODIFY] 부제 ${i + 1} 아래에 이미지 삽입`);
          await uploadSingleImage(page, imageToUpload);
          await page.waitForTimeout(500);

          // 이미지 삽입 후 본문 영역으로 돌아가기
          const newContentArea = await page.$('p.se-text-paragraph');
          if (newContentArea) {
            await newContentArea.click();
          }
          await page.keyboard.press('End');
          await page.keyboard.press('Enter');
        }
      }
    }

    await page.waitForTimeout(500);

    // 남은 이미지는 마지막에 업로드
    if (imageQueue.length > 0) {
      console.log(`[MODIFY] ${id} 남은 이미지 ${imageQueue.length}장 마지막에 업로드`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const uploadSuccess = await uploadImages(page, imageQueue);
      if (uploadSuccess) {
        console.log(`[MODIFY] ${id} 이미지 업로드 완료`);
      } else {
        console.warn(`[MODIFY] ${id} 이미지 업로드 실패 - 글 수정은 계속 진행`);
      }
      await page.waitForTimeout(1000);
    }

    // 댓글 허용 토글
    if (input.enableComments !== undefined) {
      try {
        const settingArea = await page.$('.setting_area');
        if (settingArea) {
          await settingArea.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
        }

        const commentCheckbox = await page.$('#coment');
        if (commentCheckbox) {
          const isChecked = await commentCheckbox.evaluate((el) => (el as HTMLInputElement).checked);
          if (isChecked !== input.enableComments) {
            const label = await page.$('label[for="coment"]');
            if (label) {
              await label.click();
            } else {
              await commentCheckbox.click();
            }
            console.log(`[MODIFY] 댓글 ${input.enableComments ? '허용' : '차단'}으로 변경`);
            await page.waitForTimeout(300);
          }
        }
      } catch {
        console.log('[MODIFY] 댓글 설정 변경 실패 (무시)');
      }
    }

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
