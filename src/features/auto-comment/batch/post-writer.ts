import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import type { Page } from 'playwright';
import type { PostResult, PostOptions } from './types';
import { DEFAULT_POST_OPTIONS } from './types';
import { incrementActivity } from '@/shared/models/daily-activity';

// 체크박스 상태 설정 헬퍼
const setCheckbox = async (page: Page, selector: string, checked: boolean) => {
  const checkbox = await page.$(selector);
  if (!checkbox) {
    console.log(`[DEBUG] 체크박스 ${selector} 찾을 수 없음`);
    return;
  }

  // DOM에서 직접 checked 상태 확인 (커스텀 체크박스 대응)
  const isCurrentlyChecked = await checkbox.evaluate((el) => (el as HTMLInputElement).checked);
  console.log(`[DEBUG] ${selector} 현재: ${isCurrentlyChecked}, 목표: ${checked}`);

  if (isCurrentlyChecked !== checked) {
    // 라벨 클릭 시도 (커스텀 체크박스는 라벨 클릭이 더 안정적)
    const labelSelector = `label[for="${selector.replace('#', '')}"]`;
    const label = await page.$(labelSelector);

    if (label) {
      await label.click();
      console.log(`[DEBUG] ${selector} 라벨 클릭`);
    } else {
      // 라벨 없으면 체크박스 직접 클릭
      await checkbox.click();
      console.log(`[DEBUG] ${selector} 직접 클릭`);
    }
    await page.waitForTimeout(300);
  }
};

// 게시 옵션 적용
const applyPostOptions = async (page: Page, options: PostOptions) => {
  console.log('[DEBUG] 게시 옵션 적용 중...', options);

  // 설정 영역으로 스크롤
  const settingArea = await page.$('.setting_area');
  if (settingArea) {
    await settingArea.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }

  // 댓글 허용
  await setCheckbox(page, '#coment', options.allowComment);

  // 스크랩 허용
  await setCheckbox(page, '#blog_sharing', options.allowScrap);

  // 복사/저장 허용
  await setCheckbox(page, '#copy', options.allowCopy);

  // 자동출처 사용
  await setCheckbox(page, '#automatic_source', options.useAutoSource);

  // CCL 사용
  await setCheckbox(page, '#ccl', options.useCcl);

  // CCL 세부 옵션 (CCL 사용 시에만)
  if (options.useCcl) {
    console.log('[DEBUG] CCL 세부 옵션 설정 시작');
    await page.waitForTimeout(500);

    // 영리적 이용
    const commercialBtn = await page.$('.permission_use .permission_select');
    if (commercialBtn) {
      console.log('[DEBUG] 영리적 이용 버튼 클릭');
      await commercialBtn.scrollIntoViewIfNeeded();
      await commercialBtn.click();

      // 레이어가 나타날 때까지 대기
      try {
        await page.waitForSelector('.allowCommercialUseLayer', { state: 'visible', timeout: 3000 });
        console.log('[DEBUG] 영리적 이용 레이어 표시됨');
      } catch {
        console.log('[DEBUG] 영리적 이용 레이어 대기 타임아웃');
      }

      const commercialText = options.cclCommercial === 'allow' ? '허용' : '허용 안 함';
      console.log(`[DEBUG] 영리적 이용 선택: ${commercialText}`);
      const commercialOption = await page.$$(`.allowCommercialUseLayer .layer_button`);

      let commercialFound = false;
      for (const opt of commercialOption) {
        const text = await opt.textContent();
        if (text?.trim() === commercialText) {
          await opt.click();
          commercialFound = true;
          console.log(`[DEBUG] 영리적 이용 "${commercialText}" 클릭 완료`);
          break;
        }
      }
      if (!commercialFound) {
        console.log(`[DEBUG] 영리적 이용 옵션 "${commercialText}" 찾지 못함`);
      }
      await page.waitForTimeout(300);
    } else {
      console.log('[DEBUG] 영리적 이용 버튼 없음');
    }

    // 콘텐츠 변경
    const modifyBtn = await page.$('.change_content .permission_select');
    if (modifyBtn) {
      console.log('[DEBUG] 콘텐츠 변경 버튼 클릭');
      await modifyBtn.scrollIntoViewIfNeeded();
      await modifyBtn.click();

      // 레이어가 나타날 때까지 대기
      try {
        await page.waitForSelector('.allowModifyContentsLayer', { state: 'visible', timeout: 3000 });
        console.log('[DEBUG] 콘텐츠 변경 레이어 표시됨');
      } catch {
        console.log('[DEBUG] 콘텐츠 변경 레이어 대기 타임아웃');
      }

      const modifyTextMap = { allow: '허용', same: '동일조건허용', disallow: '허용 안 함' };
      const modifyText = modifyTextMap[options.cclModify];
      console.log(`[DEBUG] 콘텐츠 변경 선택: ${modifyText}`);
      const modifyOption = await page.$$(`.allowModifyContentsLayer .layer_button`);

      let modifyFound = false;
      for (const opt of modifyOption) {
        const text = await opt.textContent();
        if (text?.trim() === modifyText) {
          await opt.click();
          modifyFound = true;
          console.log(`[DEBUG] 콘텐츠 변경 "${modifyText}" 클릭 완료`);
          break;
        }
      }
      if (!modifyFound) {
        console.log(`[DEBUG] 콘텐츠 변경 옵션 "${modifyText}" 찾지 못함`);
      }
      await page.waitForTimeout(300);
    } else {
      console.log('[DEBUG] 콘텐츠 변경 버튼 없음');
    }

    console.log('[DEBUG] CCL 세부 옵션 설정 완료');
  }

  console.log('[DEBUG] 게시 옵션 적용 완료');
};

export interface WritePostInput {
  cafeId: string;
  menuId: string;
  subject: string;
  content: string;
  category?: string; // 게시판명 (미지정 시 첫 번째 게시판)
  postOptions?: PostOptions;
}

export const writePostWithAccount = async (
  account: NaverAccount,
  input: WritePostInput
): Promise<PostResult> => {
  const { id, password } = account;
  const { cafeId, menuId, subject, content, category, postOptions = DEFAULT_POST_OPTIONS } = input;

  // 계정 락 획득 (동시 접근 방지)
  await acquireAccountLock(id);

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
    await page.keyboard.type(subject, { delay: 150 }); // 400타/분 속도
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
        await page.keyboard.type(lines[i], { delay: 150 }); // 400타/분 속도
      }
      if (i < lines.length - 1) {
        await page.keyboard.press('Enter');
      }
    }

    await page.waitForTimeout(500);

    // 게시 옵션 설정 (체크박스 조작)
    await applyPostOptions(page, postOptions);

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

    // 활동 기록
    await incrementActivity(id, cafeId, 'posts');

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
  } finally {
    // 락 해제
    releaseAccountLock(id);
  }
}
