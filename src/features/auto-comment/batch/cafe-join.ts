/**
 * 카페 가입 로직.
 *
 * 가입 후 검증/별명 충돌 처리 (2026-05-06 보강):
 * - 가입 폼 제출 후, 카페 홈으로 다시 진입해 글쓰기 버튼 노출 여부로 실제 가입을 검증한다.
 *   (resultText 텍스트만으로 판정하던 방식은 폼이 제대로 제출되지 않아도 success로 오판하던 문제 있음.)
 * - "사용할 수 없는 별명" / "이미 사용" / "중복" 결과는 NICKNAME_DUPLICATE 에러로 분리해 반환.
 * - 가입 후에도 가입 버튼이 여전히 보이면 JOIN_NOT_VERIFIED 에러로 반환.
 * - 관리자 승인 대기인 경우 PENDING_APPROVAL 에러로 반환.
 * - 별명 충돌이 잡히면 joinCafeWithNicknameRetry 가 자동 닉 변형으로 재시도하고
 *   성공 시 DB 닉네임을 갱신한다.
 */
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import type { Locator, Page } from 'playwright';

const JOIN_QUESTION_ANSWERS = [
  '네 숙지했습니다',
  '네 알겠습니다',
  '네 확인했습니다',
  '네 동의합니다',
];

const clickFirstVisible = async (
  page: Page,
  selector: string
): Promise<boolean> => {
  const candidates = page.locator(selector);
  const count = await candidates.count();

  for (let index = 0; index < count; index++) {
    const candidate = candidates.nth(index);
    const visible = await candidate.isVisible().catch(() => false);

    if (!visible) {
      continue;
    }

    await candidate.click();
    return true;
  }

  return false;
};

const hasVisible = async (locator: Locator): Promise<boolean> => {
  const count = await locator.count();

  for (let index = 0; index < count; index++) {
    const visible = await locator.nth(index).isVisible().catch(() => false);

    if (visible) {
      return true;
    }
  }

  return false;
};

const fillJoinForm = async (
  page: Page,
  fallbackNickname: string
): Promise<void> => {
  const textControls = page.locator(
    'textarea:visible, input[type="text"]:visible, input:not([type]):visible'
  );
  const textControlCount = await textControls.count();
  let answerIndex = 0;

  for (let index = 0; index < textControlCount; index++) {
    const control = textControls.nth(index);
    const metadata = await control.evaluate((element) => {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      const label = input.labels?.[0]?.textContent || '';

      return {
        id: input.id || '',
        name: input.name || '',
        placeholder: input.placeholder || '',
        value: input.value || '',
        label,
        maxLength: input.maxLength,
      };
    });
    const joinedMetadata = [
      metadata.id,
      metadata.name,
      metadata.placeholder,
      metadata.label,
    ].join(' ');
    const isNicknameField =
      joinedMetadata.includes('nick') ||
      joinedMetadata.includes('별명') ||
      joinedMetadata.includes('닉네임');

    if (isNicknameField && metadata.value.trim()) {
      continue;
    }

    const rawValue = isNicknameField
      ? fallbackNickname
      : JOIN_QUESTION_ANSWERS[answerIndex] || JOIN_QUESTION_ANSWERS.at(-1) || '네 알겠습니다';
    const maxLength = metadata.maxLength > 0 ? metadata.maxLength : rawValue.length;
    const value = rawValue.slice(0, maxLength);

    await control.fill(value);

    if (!isNicknameField) {
      answerIndex += 1;
    }
  }

  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();

  for (let index = 0; index < checkboxCount; index++) {
    const checkbox = checkboxes.nth(index);
    const checked = await checkbox.isChecked().catch(() => false);

    if (!checked) {
      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.click({ force: true });
      });
    }
  }
};

const getPageText = async (page: Page): Promise<string> => {
  return page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
};

export interface JoinCafeResult {
  success: boolean;
  accountId: string;
  alreadyMember?: boolean;
  error?: string;
}

export const joinCafeWithAccount = async (
  account: NaverAccount,
  cafeId: string,
  options: { cafeUrl?: string } = {}
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

    const cafeHomeUrl = options.cafeUrl
      ? `https://m.cafe.naver.com/${options.cafeUrl}`
      : `https://m.cafe.naver.com/ca-fe/web/cafes/${cafeId}`;

    await page.goto(cafeHomeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(2000);

    const writeButton = page.locator(
      'a:has-text("글쓰기"), button:has-text("글쓰기"), a[href*="/articles/write"]'
    );
    if (await hasVisible(writeButton)) {
      return {
        success: true,
        accountId: id,
        alreadyMember: true,
      };
    }

    const clickedJoin = await clickFirstVisible(
      page,
      [
        'button:has-text("카페 가입하기")',
        'a:has-text("카페 가입하기")',
        'button:has-text("가입하기")',
        'a:has-text("가입하기")',
        'a[href*="/join"]',
      ].join(', ')
    );

    if (!clickedJoin) {
      const pageText = await getPageText(page);

      if (pageText.includes('카페 가입하기') === false) {
        return {
          success: true,
          accountId: id,
          alreadyMember: true,
        };
      }

      return {
        success: false,
        accountId: id,
        error: '가입 버튼을 찾을 수 없습니다. 이미 가입됐거나 가입이 제한된 카페일 수 있습니다.',
      };
    }

    await page.waitForTimeout(2000);

    const fallbackNickname = (nickname || id).trim().slice(0, 20) || id;
    await fillJoinForm(page, fallbackNickname);
    await page.waitForTimeout(500);

    const clickedSubmit = await clickFirstVisible(
      page,
      [
        'button:has-text("동의 후 가입하기")',
        'a:has-text("동의 후 가입하기")',
        'button:has-text("가입하기")',
        'button:has-text("확인")',
        'button[type="submit"]',
      ].join(', ')
    );

    if (!clickedSubmit) {
      return {
        success: false,
        accountId: id,
        error: '가입 완료 버튼을 찾을 수 없습니다.',
      };
    }

    await page.waitForTimeout(4000);
    const resultText = await getPageText(page);
    if (
      resultText.includes('사용할 수 없는 별명') ||
      resultText.includes('별명을 다시') ||
      resultText.includes('이미 사용') ||
      resultText.includes('중복')
    ) {
      return {
        success: false,
        accountId: id,
        error: 'NICKNAME_DUPLICATE: ' + resultText.slice(0, 100),
      };
    }
    if (
      resultText.includes('가입이 제한') ||
      resultText.includes('가입할 수 없습니다')
    ) {
      return {
        success: false,
        accountId: id,
        error: resultText.slice(0, 160),
      };
    }

    // 가입 결과 검증: 카페로 다시 진입해서 글쓰기 버튼 노출 여부 체크
    await page.goto(cafeHomeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2500);
    const verifyWrite = page.locator(
      'a:has-text("글쓰기"), button:has-text("글쓰기"), a[href*="/articles/write"]'
    );
    if (await hasVisible(verifyWrite)) {
      await saveCookiesForAccount(id);
      return { success: true, accountId: id, alreadyMember: false };
    }

    const stillJoinBtn = page.locator(
      'button:has-text("가입하기"), a:has-text("가입하기")'
    );
    if (await hasVisible(stillJoinBtn)) {
      return {
        success: false,
        accountId: id,
        error: 'JOIN_NOT_VERIFIED: 가입 후에도 가입 버튼이 보임 (별명 충돌 또는 추가 인증 필요)',
      };
    }

    if (/가입.{0,3}신청.{0,3}완료|승인.{0,3}대기/.test(resultText)) {
      return {
        success: false,
        accountId: id,
        error: 'PENDING_APPROVAL: 가입 신청 완료, 관리자 승인 대기',
      };
    }

    await saveCookiesForAccount(id);
    return { success: true, accountId: id, alreadyMember: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return {
      success: false,
      accountId: id,
      error: errorMessage,
    };
  }
}

// 별명 충돌/검증 실패 시 변형 닉네임으로 재시도 + DB 갱신
export const joinCafeWithNicknameRetry = async (
  account: NaverAccount,
  cafeId: string,
  options: { cafeUrl?: string; updateDbNickname?: (newNickname: string) => Promise<void> } = {},
): Promise<JoinCafeResult & { finalNickname?: string }> => {
  const baseNick = account.nickname || account.id;
  const variants: string[] = [
    baseNick,
    baseNick + '2',
    baseNick + '쇼지',
    baseNick + '준이',
    baseNick + '준삼',
    baseNick + '이야',
    baseNick.replace(/(\d+)$/, (_, n) => String(Number(n) + 1)),
    baseNick + Math.floor(Math.random() * 99 + 1),
  ];
  const seen = new Set<string>();
  for (const nick of variants) {
    const trimmed = nick.trim().slice(0, 20);
    if (seen.has(trimmed) || !trimmed) continue;
    seen.add(trimmed);

    const r = await joinCafeWithAccount(
      { ...account, nickname: trimmed },
      cafeId,
      options.cafeUrl ? { cafeUrl: options.cafeUrl } : {}
    );
    if (r.success) {
      if (trimmed !== baseNick && options.updateDbNickname) {
        await options.updateDbNickname(trimmed).catch(() => {});
      }
      return { ...r, finalNickname: trimmed };
    }
    if (!r.error || !/NICKNAME_DUPLICATE|JOIN_NOT_VERIFIED|별명|중복/.test(r.error)) {
      return r;
    }
  }
  return { success: false, accountId: account.id, error: '모든 닉네임 변형 시도 실패' };
};

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

        const result = await joinCafeWithAccount(account, cafe.cafeId, {
          cafeUrl: cafe.cafeUrl,
        });

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
