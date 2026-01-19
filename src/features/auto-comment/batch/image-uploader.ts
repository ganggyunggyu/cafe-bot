import type { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// URL에서 확장자 추출 (쿼리스트링 제거)
const getExtensionFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    return ext && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
  } catch {
    return 'png';
  }
};

// 이미지 URL을 다운로드하여 임시 파일로 저장
export const downloadImageToTempFile = async (
  imageUrl: string,
  index: number
): Promise<string | null> => {
  try {
    console.log(`[IMAGE] 이미지 다운로드 중: ${imageUrl}`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`[IMAGE] 다운로드 실패: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tempDir = os.tmpdir();
    const ext = getExtensionFromUrl(imageUrl);
    const fileName = `upload_image_${Date.now()}_${index}.${ext}`;
    const filePath = path.join(tempDir, fileName);

    fs.writeFileSync(filePath, buffer);
    console.log(`[IMAGE] 임시 파일 저장: ${filePath} (${Math.round(buffer.length / 1024)}KB)`);
    return filePath;
  } catch (error) {
    console.error(`[IMAGE] 다운로드 오류:`, error);
    return null;
  }
};

// Base64 이미지를 임시 파일로 저장하고 경로 반환
export const saveBase64ToTempFile = (base64Data: string, index: number): string => {
  const tempDir = os.tmpdir();
  const fileName = `upload_image_${Date.now()}_${index}.png`;
  const filePath = path.join(tempDir, fileName);

  // Base64 데이터에서 data:image/xxx;base64, 접두사 제거
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Content, 'base64');

  fs.writeFileSync(filePath, buffer);
  return filePath;
};

// 임시 파일 정리
export const cleanupTempFiles = (filePaths: string[]) => {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      console.warn(`[IMAGE] 임시 파일 삭제 실패: ${filePath}`);
    }
  }
};

// 네이버 카페 에디터 이미지 버튼 셀렉터
const IMAGE_BUTTON_SELECTORS = [
  'button.se-image-toolbar-button',
  'button[data-name="image"]',
  '.se-toolbar button[data-module="image"]',
  '.se-toolbar-item-image button',
  'button.se-text-icon-toolbar-image',
];

// 파일 input 셀렉터
const FILE_INPUT_SELECTORS = [
  'input[type="file"][accept*="image"]',
  'input[type="file"]',
  '.se-image-uploader input[type="file"]',
];

// 이미지 컴포넌트 셀렉터 (업로드 확인용)
const IMAGE_COMPONENT_SELECTORS = [
  '.se-image-resource',
  '.se-component-image',
  '.se-module-image',
  'img.se-image-resource',
];

// 팝업 닫기 셀렉터
const POPUP_CLOSE_SELECTORS = [
  '.se-popup-close-button',
  '.se-popup-button-cancel',
  'button.se-popup-close',
  '.se-image-uploader-close',
];

// 이미지 업로드 팝업 닫기
const closeImagePopup = async (page: Page): Promise<void> => {
  // 방법 1: 닫기 버튼 클릭
  for (const selector of POPUP_CLOSE_SELECTORS) {
    const closeBtn = await page.$(selector);
    if (closeBtn) {
      try {
        await closeBtn.click();
        console.log(`[IMAGE] 팝업 닫기 버튼 클릭: ${selector}`);
        await page.waitForTimeout(500);
        return;
      } catch {
        // 클릭 실패 시 다음 방법 시도
      }
    }
  }

  // 방법 2: ESC 키로 팝업 닫기
  const popupDim = await page.$('.se-popup-dim');
  if (popupDim) {
    console.log('[IMAGE] ESC 키로 팝업 닫기 시도');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 방법 3: 에디터 본문 영역 클릭 (팝업 외부 클릭)
  const editorBody = await page.$('.se-component-content');
  if (editorBody) {
    try {
      await editorBody.click({ force: true });
      console.log('[IMAGE] 에디터 본문 클릭으로 팝업 닫기');
      await page.waitForTimeout(500);
    } catch {
      // 클릭 실패 무시
    }
  }
};

// 팝업이 완전히 닫힐 때까지 대기
const waitForPopupClose = async (page: Page, maxWait = 5000): Promise<void> => {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const popupDim = await page.$('.se-popup-dim');
    if (!popupDim) {
      console.log('[IMAGE] 팝업 닫힘 확인');
      return;
    }

    // 팝업이 아직 있으면 ESC 다시 시도
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  console.log('[IMAGE] 팝업 닫기 대기 타임아웃 - 강제 진행');
};

// 이미지 업로드 (URL 또는 base64 지원)
export const uploadImages = async (page: Page, images: string[]): Promise<boolean> => {
  if (!images || images.length === 0) return true;

  console.log(`[IMAGE] 이미지 ${images.length}장 업로드 시작`);
  const tempFiles: string[] = [];

  try {
    // 이미지를 임시 파일로 저장 (URL이면 다운로드, base64면 변환)
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let tempPath: string | null = null;

      if (img.startsWith('http')) {
        tempPath = await downloadImageToTempFile(img, i);
      } else {
        tempPath = saveBase64ToTempFile(img, i);
        console.log(`[IMAGE] 임시 파일 생성 (base64): ${tempPath}`);
      }

      if (tempPath) {
        tempFiles.push(tempPath);
      } else {
        console.warn(`[IMAGE] 이미지 ${i + 1} 처리 실패`);
      }
    }

    if (tempFiles.length === 0) {
      console.error('[IMAGE] 처리된 이미지 없음');
      return false;
    }

    // 이미지 버튼 찾기
    let imageButton = null;
    for (const selector of IMAGE_BUTTON_SELECTORS) {
      imageButton = await page.$(selector);
      if (imageButton) {
        console.log(`[IMAGE] 이미지 버튼 발견: ${selector}`);
        break;
      }
    }

    if (!imageButton) {
      console.log('[IMAGE] 이미지 버튼 찾을 수 없음 - 모든 셀렉터 실패');
      const allButtons = await page.$$('button');
      console.log(`[IMAGE] 페이지 내 버튼 ${allButtons.length}개 존재`);
      return false;
    }

    // 시스템 파일 선택기 처리 (filechooser 이벤트)
    console.log('[IMAGE] filechooser 이벤트 대기 중...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      imageButton.click(),
    ]);

    // 파일 선택
    await fileChooser.setFiles(tempFiles);
    console.log(`[IMAGE] 파일 ${tempFiles.length}개 설정 완료 (filechooser)`);

    // 네이버 에디터 이미지 업로드 완료 대기 (업로드 + 삽입 시간)
    console.log('[IMAGE] 이미지 업로드 대기 중...');
    await page.waitForTimeout(5000);

    // 이미지 컴포넌트 확인 (최대 10초 대기) - 팝업 닫기 전에 확인
    let imageCount = 0;
    for (let retry = 0; retry < 10; retry++) {
      for (const selector of IMAGE_COMPONENT_SELECTORS) {
        const components = await page.$$(selector);
        if (components.length > 0) {
          imageCount = components.length;
          console.log(`[IMAGE] 이미지 컴포넌트 발견: ${selector} (${imageCount}개)`);
          break;
        }
      }
      if (imageCount > 0) break;
      console.log(`[IMAGE] 이미지 대기 중... (${retry + 1}/10)`);
      await page.waitForTimeout(1000);
    }

    // 팝업 닫기 (이미지 확인 후)
    await closeImagePopup(page);
    await waitForPopupClose(page);

    if (imageCount === 0) {
      console.log('[IMAGE] 이미지 컴포넌트 확인 실패 - 에디터에 이미지 없음');
    }

    return imageCount > 0;
  } catch (error) {
    console.error('[IMAGE] 이미지 업로드 오류:', error);
    return false;
  } finally {
    cleanupTempFiles(tempFiles);
  }
};
