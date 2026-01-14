import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  closeAllContexts,
} from '@/shared/lib/multi-session';
import { generateRandomNickname, resetUsedNicknames } from './nickname-generator';
import type { NaverAccount } from '@/shared/lib/account-manager';
import type { CafeConfig } from '@/shared/config/cafes';

export interface NicknameChangeResult {
  success: boolean;
  accountId: string;
  cafeId: string;
  cafeName: string;
  oldNickname?: string;
  newNickname?: string;
  error?: string;
}

export interface BatchNicknameResult {
  success: boolean;
  total: number;
  changed: number;
  failed: number;
  results: NicknameChangeResult[];
}

export type NicknameChangeMode = 'by-cafe' | 'by-account' | 'all';

/**
 * 단일 계정의 특정 카페 닉네임 변경
 */
export const changeNicknameInCafe = async (
  account: NaverAccount,
  cafe: { cafeId: string; name: string },
  newNickname: string
): Promise<NicknameChangeResult> => {
  const { id, password } = account;

  try {
    // 로그인 확인
    const loggedIn = await isAccountLoggedIn(id);
    if (!loggedIn) {
      const loginResult = await loginAccount(id, password);
      if (!loginResult.success) {
        return {
          success: false,
          accountId: id,
          cafeId: cafe.cafeId,
          cafeName: cafe.name,
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(id);

    // 카페 메인 페이지로 이동
    const cafeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}`;
    await page.goto(cafeUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // "나의활동" 버튼 클릭
    const myActivityButton = await page.$('button.gm-tcol-t:has-text("나의활동")');
    if (!myActivityButton) {
      return {
        success: false,
        accountId: id,
        cafeId: cafe.cafeId,
        cafeName: cafe.name,
        error: '나의활동 버튼을 찾을 수 없습니다. 카페 미가입 상태일 수 있습니다.',
      };
    }

    // 새 창 감지를 위한 이벤트 리스너
    const [popup] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 10000 }),
      myActivityButton.click(),
    ]);

    await popup.waitForLoadState('networkidle');
    await popup.waitForTimeout(2000);

    // 프로필 설정 페이지인지 확인
    const currentUrl = popup.url();
    if (!currentUrl.includes('profile-setting')) {
      // 프로필 설정으로 직접 이동 시도
      // 나의활동 페이지에서 설정 버튼 찾기
      const settingButton = await popup.$('a[href*="profile-setting"], button:has-text("설정")');
      if (settingButton) {
        await settingButton.click();
        await popup.waitForTimeout(2000);
      }
    }

    // 닉네임 입력 textarea 찾기
    const nicknameTextarea = await popup.$('textarea[type="text"], textarea.nickname-input, textarea');
    if (!nicknameTextarea) {
      await popup.close();
      return {
        success: false,
        accountId: id,
        cafeId: cafe.cafeId,
        cafeName: cafe.name,
        error: '닉네임 입력 필드를 찾을 수 없습니다.',
      };
    }

    // 기존 닉네임 저장
    const oldNickname = await nicknameTextarea.inputValue();

    // 닉네임 변경
    await nicknameTextarea.fill('');
    await nicknameTextarea.fill(newNickname);
    await popup.waitForTimeout(500);

    // 확인 버튼 클릭
    const confirmButton = await popup.$(
      'a.BaseButton--green, button.BaseButton--green, a:has-text("확인"), button:has-text("확인")'
    );

    if (!confirmButton) {
      await popup.close();
      return {
        success: false,
        accountId: id,
        cafeId: cafe.cafeId,
        cafeName: cafe.name,
        oldNickname,
        newNickname,
        error: '확인 버튼을 찾을 수 없습니다.',
      };
    }

    await confirmButton.click();
    await popup.waitForTimeout(2000);

    // 팝업 닫기
    await popup.close();

    await saveCookiesForAccount(id);

    return {
      success: true,
      accountId: id,
      cafeId: cafe.cafeId,
      cafeName: cafe.name,
      oldNickname,
      newNickname,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      success: false,
      accountId: id,
      cafeId: cafe.cafeId,
      cafeName: cafe.name,
      error: errorMessage,
    };
  }
};

/**
 * 배치 닉네임 변경 - 카페 기준 (하나의 카페에 모든 계정)
 */
export const changeByCafe = async (
  accounts: NaverAccount[],
  cafe: CafeConfig,
  onProgress?: (msg: string) => void
): Promise<BatchNicknameResult> => {
  resetUsedNicknames();
  const results: NicknameChangeResult[] = [];
  let changed = 0;
  let failed = 0;

  console.log(`[NICKNAME] 카페 기준 변경 시작: ${cafe.name} - ${accounts.length}개 계정`);
  onProgress?.(`${cafe.name} 카페에서 ${accounts.length}개 계정 닉네임 변경 시작`);

  for (const account of accounts) {
    const newNickname = generateRandomNickname();
    onProgress?.(`${account.id} → ${newNickname} 변경 중...`);

    const result = await changeNicknameInCafe(
      account,
      { cafeId: cafe.cafeId, name: cafe.name },
      newNickname
    );

    results.push(result);

    if (result.success) {
      changed++;
      console.log(`[NICKNAME] ${account.id} - ${cafe.name}: ${result.oldNickname} → ${result.newNickname}`);
    } else {
      failed++;
      console.log(`[NICKNAME] ${account.id} - ${cafe.name}: 실패 - ${result.error}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  return {
    success: failed === 0,
    total: accounts.length,
    changed,
    failed,
    results,
  };
};

/**
 * 배치 닉네임 변경 - 계정 기준 (하나의 계정으로 모든 카페)
 */
export const changeByAccount = async (
  account: NaverAccount,
  cafes: CafeConfig[],
  onProgress?: (msg: string) => void
): Promise<BatchNicknameResult> => {
  resetUsedNicknames();
  const results: NicknameChangeResult[] = [];
  let changed = 0;
  let failed = 0;

  console.log(`[NICKNAME] 계정 기준 변경 시작: ${account.id} - ${cafes.length}개 카페`);
  onProgress?.(`${account.id} 계정으로 ${cafes.length}개 카페 닉네임 변경 시작`);

  for (const cafe of cafes) {
    const newNickname = generateRandomNickname();
    onProgress?.(`${cafe.name} → ${newNickname} 변경 중...`);

    const result = await changeNicknameInCafe(
      account,
      { cafeId: cafe.cafeId, name: cafe.name },
      newNickname
    );

    results.push(result);

    if (result.success) {
      changed++;
      console.log(`[NICKNAME] ${account.id} - ${cafe.name}: ${result.oldNickname} → ${result.newNickname}`);
    } else {
      failed++;
      console.log(`[NICKNAME] ${account.id} - ${cafe.name}: 실패 - ${result.error}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  return {
    success: failed === 0,
    total: cafes.length,
    changed,
    failed,
    results,
  };
};

/**
 * 배치 닉네임 변경 - 전체 (모든 계정 × 모든 카페)
 */
export const changeAll = async (
  onProgress?: (msg: string) => void
): Promise<BatchNicknameResult> => {
  const { connectDB } = await import('@/shared/lib/mongodb');
  const { Account } = await import('@/shared/models/account');
  const { Cafe } = await import('@/shared/models/cafe');

  await connectDB();

  const accounts = await Account.find({ isActive: true }).lean();
  const cafes = await Cafe.find({ isActive: true }).lean();

  resetUsedNicknames();
  const results: NicknameChangeResult[] = [];
  let changed = 0;
  let failed = 0;

  const total = accounts.length * cafes.length;

  console.log(`[NICKNAME] 전체 변경 시작: ${accounts.length}개 계정 × ${cafes.length}개 카페 = ${total}건`);
  onProgress?.(`전체 변경 시작: ${accounts.length}개 계정 × ${cafes.length}개 카페`);

  try {
    for (const account of accounts) {
      const naverAccount: NaverAccount = {
        id: account.accountId,
        password: account.password,
        nickname: account.nickname,
        isMain: account.isMain,
      };

      for (const cafe of cafes) {
        const newNickname = generateRandomNickname();
        onProgress?.(`${account.accountId} - ${cafe.name} → ${newNickname} 변경 중...`);

        const result = await changeNicknameInCafe(
          naverAccount,
          { cafeId: cafe.cafeId, name: cafe.name },
          newNickname
        );

        results.push(result);

        if (result.success) {
          changed++;
          console.log(`[NICKNAME] ${account.accountId} - ${cafe.name}: 변경 완료`);
        } else {
          failed++;
          console.log(`[NICKNAME] ${account.accountId} - ${cafe.name}: 실패 - ${result.error}`);
        }

        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    console.log(`[NICKNAME] 전체 변경 완료: 성공 ${changed}, 실패 ${failed}`);
    onProgress?.(`완료: 성공 ${changed}, 실패 ${failed}`);

    return {
      success: failed === 0,
      total,
      changed,
      failed,
      results,
    };
  } finally {
    await closeAllContexts();
  }
};
