import { join } from 'path';
import { existsSync } from 'fs';
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  closeAllContexts,
} from '@/shared/lib/multi-session';
import { connectDB } from '@/shared/lib/mongodb';
import mongoose from 'mongoose';

const PROFILE_IMAGES_DIR = join(process.cwd(), 'profile-images');

const CAFES = [
  { cafeId: '25729954', cafeUrl: 'shopjirmsin', name: '쇼핑지름신' },
  { cafeId: '25460974', cafeUrl: 'shoppingtpw', name: '샤넬오픈런' },
  { cafeId: '25636798', cafeUrl: 'freemapleafreecabj', name: '건강한노후준비' },
  { cafeId: '25227349', cafeUrl: 'minemh', name: '건강관리소' },
];

const USER_ID = 'user-1768955529317';

interface ProfileChangeResult {
  accountId: string;
  nickname: string;
  cafeId: string;
  cafeName: string;
  success: boolean;
  error?: string;
}

const changeProfileImageInCafe = async (
  accountId: string,
  password: string,
  cafe: typeof CAFES[0],
  imagePath: string
): Promise<ProfileChangeResult> => {
  const result: ProfileChangeResult = {
    accountId,
    nickname: '',
    cafeId: cafe.cafeId,
    cafeName: cafe.name,
    success: false,
  };

  try {
    const loggedIn = await isAccountLoggedIn(accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(accountId, password);
      if (!loginResult.success) {
        result.error = `로그인 실패: ${loginResult.error}`;
        return result;
      }
    }

    const page = await getPageForAccount(accountId);

    // 카페 메인 페이지로 이동
    const cafeHomeUrl = `https://cafe.naver.com/${cafe.cafeUrl}`;
    await page.goto(cafeHomeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // "나의활동" 버튼 클릭
    let myActivityButton = await page.$('button[onclick*="showMyAction"]');
    if (!myActivityButton) {
      myActivityButton = await page.$('button:has-text("나의활동")');
    }
    if (!myActivityButton) {
      result.error = '나의활동 버튼을 찾을 수 없음 (카페 미가입?)';
      return result;
    }

    await myActivityButton.click();
    await page.waitForTimeout(1500);

    // "프로필 변경하기" 링크 클릭
    let profileEditLink = await page.$('a[onclick*="cafeMemberInfoEdit"]');
    if (!profileEditLink) {
      profileEditLink = await page.$('a:has-text("프로필 변경하기")');
    }
    if (!profileEditLink) {
      // 톱니바퀴(설정) 아이콘 클릭 후 다시 시도
      const settingsButton = await page.$('button.my_setting, a.my_setting, button[class*="setting"], .ico_setting');
      if (settingsButton) {
        await settingsButton.click();
        await page.waitForTimeout(1000);
        profileEditLink = await page.$('a[onclick*="cafeMemberInfoEdit"]');
        if (!profileEditLink) {
          profileEditLink = await page.$('a:has-text("프로필 변경하기")');
        }
      }
    }
    if (!profileEditLink) {
      result.error = '프로필 변경하기 링크를 찾을 수 없음';
      return result;
    }

    // 팝업 감지 + 클릭
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 10000 }),
      profileEditLink.click(),
    ]);

    await popup.waitForLoadState('networkidle');
    await popup.waitForTimeout(2000);

    // 카메라 버튼 클릭 → 드롭다운 메뉴 열기
    const cameraBtn = await popup.$('button.btn_camera');
    if (!cameraBtn) {
      result.error = '사진 등록 버튼(btn_camera)을 찾을 수 없음';
      await popup.close();
      return result;
    }
    await cameraBtn.click();
    await popup.waitForTimeout(1000);

    // 드롭다운 내 input#img_upload에 직접 파일 설정
    const fileInput = await popup.$('input#img_upload');
    if (!fileInput) {
      result.error = 'input#img_upload을 찾을 수 없음';
      await popup.close();
      return result;
    }
    await fileInput.setInputFiles(imagePath);
    console.log(`  [PHOTO] 파일 선택 완료`);

    await popup.waitForTimeout(2000);

    // 확인 버튼 클릭
    const confirmSelectors = [
      'a.BaseButton--green',
      'button.BaseButton--green',
      'a:has-text("확인")',
      'button:has-text("확인")',
      'a.btn_confirm',
      'button.btn_confirm',
      'input[type="submit"]',
    ];

    let confirmButton = null;
    for (const selector of confirmSelectors) {
      confirmButton = await popup.$(selector);
      if (confirmButton) break;
    }

    if (!confirmButton) {
      result.error = '확인 버튼을 찾을 수 없음';
      await popup.close();
      return result;
    }

    await confirmButton.click();
    await popup.waitForTimeout(3000);

    // 팝업 닫기
    try {
      await popup.close();
    } catch {
      // 팝업이 이미 닫힌 경우
    }

    await saveCookiesForAccount(accountId);
    result.success = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : '알 수 없는 오류';
    return result;
  }
};

const main = async () => {
  await connectDB();
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error('MongoDB database connection is not ready');
  }

  const accounts = await db
    .collection('accounts')
    .find({ userId: USER_ID, isActive: true })
    .toArray();

  console.log(`[PROFILE] ${accounts.length}개 계정 × ${CAFES.length}개 카페 = ${accounts.length * CAFES.length}건 처리 예정`);
  console.log('');

  let success = 0;
  let fail = 0;
  const results: ProfileChangeResult[] = [];

  for (const account of accounts) {
    const { accountId, password, nickname } = account;
    const imagePath = join(PROFILE_IMAGES_DIR, `${accountId}.jpg`);

    if (!existsSync(imagePath)) {
      console.log(`[SKIP] ${accountId} (${nickname}) - 이미지 파일 없음: ${imagePath}`);
      continue;
    }

    console.log(`\n[ACCOUNT] ${accountId} (${nickname})`);

    for (const cafe of CAFES) {
      console.log(`  [CAFE] ${cafe.name} 프로필 사진 변경 중...`);

      const result = await changeProfileImageInCafe(accountId, password, cafe, imagePath);
      result.nickname = nickname || '';
      results.push(result);

      if (result.success) {
        success++;
        console.log(`  [OK] ${cafe.name} 프로필 사진 변경 완료`);
      } else {
        fail++;
        console.log(`  [FAIL] ${cafe.name} - ${result.error}`);
      }

      // 카페 간 딜레이
      await new Promise((r) => setTimeout(r, 3000));
    }

    // 계정 간 딜레이
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n========== 결과 ==========');
  console.log(`성공: ${success} / 실패: ${fail} / 전체: ${success + fail}`);

  if (fail > 0) {
    console.log('\n실패 목록:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.accountId} (${r.nickname}) @ ${r.cafeName}: ${r.error}`);
      });
  }

  await closeAllContexts();
  process.exit(0);
};

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
