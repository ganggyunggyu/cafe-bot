import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';

export interface JoinCafeResult {
  success: boolean;
  accountId: string;
  alreadyMember?: boolean;
  error?: string;
}

export const joinCafeWithAccount = async (
  account: NaverAccount,
  cafeId: string
): Promise<JoinCafeResult> => {
  const { id, password, nickname } = account;

  try {
    const loggedIn = await isAccountLoggedIn(id);

    if (!loggedIn) {
      const loginResult = await loginAccount(id, password);
      if (!loginResult.success) {
        return {
          success: false,
          accountId: id,
          error: loginResult.error || '로그인 실패',
        };
      }
    }

    const page = await getPageForAccount(id);

    // 카페 메인 페이지로 이동
    const cafeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}`;

    await page.goto(cafeUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    // 이미 가입된 멤버인지 확인 (글쓰기 버튼이 있으면 이미 가입됨)
    const writeButton = await page.$('a.btn_write, button.btn_write, a[href*="write"]');
    if (writeButton) {
      return {
        success: true,
        accountId: id,
        alreadyMember: true,
      };
    }

    // 가입 버튼 찾기 (여러 셀렉터 시도)
    const joinButton = await page.$(
      'a.btn_join, button.btn_join, a[href*="join"], button:has-text("가입"), a:has-text("가입")'
    );

    if (!joinButton) {
      // 가입 버튼이 없으면 이미 가입됐거나 가입 불가능한 카페
      return {
        success: false,
        accountId: id,
        error: '가입 버튼을 찾을 수 없습니다. 이미 가입됐거나 가입이 제한된 카페일 수 있습니다.',
      };
    }

    await joinButton.click();
    await page.waitForTimeout(2000);

    // 닉네임 입력 필드가 있으면 입력
    const nicknameInput = await page.$('input[name="nickname"], input.nickname_input, input#nickname');
    if (nicknameInput) {
      await nicknameInput.fill(nickname || id);
      await page.waitForTimeout(500);
    }

    // 가입 완료 버튼 클릭
    const confirmButton = await page.$(
      'button.btn_confirm, a.btn_confirm, button:has-text("가입하기"), button:has-text("확인"), button[type="submit"]'
    );

    if (confirmButton) {
      await confirmButton.click();
      await page.waitForTimeout(2000);
    }

    await saveCookiesForAccount(id);

    return {
      success: true,
      accountId: id,
      alreadyMember: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      success: false,
      accountId: id,
      error: errorMessage,
    };
  }
}

// 여러 계정 일괄 가입
export const joinCafeWithAccounts = async (
  accounts: NaverAccount[],
  cafeId: string
): Promise<JoinCafeResult[]> => {
  const results: JoinCafeResult[] = [];

  for (const account of accounts) {
    const result = await joinCafeWithAccount(account, cafeId);
    results.push(result);

    // 계정 간 딜레이
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return results;
}

// 배치 가입 결과
export interface BatchJoinResult {
  success: boolean;
  total: number;
  joined: number;
  alreadyMember: number;
  failed: number;
  results: Array<JoinCafeResult & { cafeName: string }>;
}

// 전체 계정 → 전체 카페 배치 가입
export const runBatchCafeJoin = async (
  onProgress?: (msg: string) => void
): Promise<BatchJoinResult> => {
  // 동적 import로 순환 참조 방지
  const { getAllAccounts } = await import('@/shared/config/accounts');
  const { getAllCafes } = await import('@/shared/config/cafes');
  const { closeAllContexts } = await import('@/shared/lib/multi-session');

  const accounts = await getAllAccounts();
  const cafes = await getAllCafes();

  const results: Array<JoinCafeResult & { cafeName: string }> = [];
  let joined = 0;
  let alreadyMember = 0;
  let failed = 0;

  const total = accounts.length * cafes.length;

  console.log(`[CAFE-JOIN] 배치 시작: ${accounts.length}개 계정 × ${cafes.length}개 카페 = ${total}건`);
  onProgress?.(`배치 시작: ${accounts.length}개 계정 × ${cafes.length}개 카페`);

  try {
    for (const account of accounts) {
      for (const cafe of cafes) {
        onProgress?.(`${account.id} → ${cafe.name} 가입 시도...`);

        const result = await joinCafeWithAccount(account, cafe.cafeId);

        results.push({
          ...result,
          cafeName: cafe.name,
        });

        if (result.alreadyMember) {
          alreadyMember++;
          console.log(`[CAFE-JOIN] ${account.id} - ${cafe.name}: 이미 회원`);
        } else if (result.success) {
          joined++;
          console.log(`[CAFE-JOIN] ${account.id} - ${cafe.name}: 가입 완료`);
        } else {
          failed++;
          console.log(`[CAFE-JOIN] ${account.id} - ${cafe.name}: 실패 - ${result.error}`);
        }

        // 다음 요청 전 딜레이
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    console.log(`[CAFE-JOIN] 배치 완료: 가입 ${joined}, 이미 회원 ${alreadyMember}, 실패 ${failed}`);
    onProgress?.(`완료: 가입 ${joined}, 이미 회원 ${alreadyMember}, 실패 ${failed}`);

    return {
      success: failed === 0,
      total,
      joined,
      alreadyMember,
      failed,
      results,
    };
  } finally {
    await closeAllContexts();
  }
}
