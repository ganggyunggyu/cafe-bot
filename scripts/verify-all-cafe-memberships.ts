import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { User } from '../src/shared/models/user';
import {
  acquireAccountLock,
  closeAllContexts,
  closeContextForAccount,
  getPageForAccount,
  invalidateLoginCache,
  loginAccount,
  releaseAccountLock,
} from '../src/shared/lib/multi-session';

interface AccountRow {
  accountId: string;
  password: string;
  nickname?: string;
  role?: string;
}

interface CafeRow {
  name: string;
  cafeId: string;
  cafeUrl: string;
}

interface AuditRow {
  accountId: string;
  nickname: string;
  role: string;
  cafeName: string;
  cafeId: string;
  loginStatus: 'OK' | 'FAIL';
  membershipStatus: 'JOINED' | 'NOT_JOINED' | 'UNKNOWN' | 'SKIPPED';
  detail: string;
}

interface CliOptions {
  accountIds: string[];
  cafeNames: string[];
  forceFreshLogin: boolean;
  loginId: string;
  loginWaitMs: number;
  waitBetweenAccountsMs: number;
}

const DEFAULT_LOGIN_ID = '21lab';
const DEFAULT_LOGIN_WAIT_MS = 60_000;
const DEFAULT_WAIT_BETWEEN_ACCOUNTS_MS = 2_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const getNextArg = (args: string[], index: number, name: string): string => {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} 값이 필요합니다.`);
  }

  return value;
};

const parseCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseCliOptions = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    accountIds: [],
    cafeNames: [],
    forceFreshLogin: true,
    loginId: process.env.LOGIN_ID || DEFAULT_LOGIN_ID,
    loginWaitMs: Number(process.env.LOGIN_WAIT_MS || DEFAULT_LOGIN_WAIT_MS),
    waitBetweenAccountsMs: Number(
      process.env.WAIT_BETWEEN_ACCOUNTS_MS || DEFAULT_WAIT_BETWEEN_ACCOUNTS_MS,
    ),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--account') {
      options.accountIds.push(getNextArg(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--accounts') {
      options.accountIds.push(...parseCsv(getNextArg(args, index, arg)));
      index += 1;
      continue;
    }

    if (arg === '--cafe') {
      options.cafeNames.push(getNextArg(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--cafes') {
      options.cafeNames.push(...parseCsv(getNextArg(args, index, arg)));
      index += 1;
      continue;
    }

    if (arg === '--login-id') {
      options.loginId = getNextArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--login-wait-ms') {
      options.loginWaitMs = Number(getNextArg(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--wait-between-accounts-ms') {
      options.waitBetweenAccountsMs = Number(getNextArg(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === '--no-fresh-login') {
      options.forceFreshLogin = false;
      continue;
    }

    throw new Error(`알 수 없는 옵션: ${arg}`);
  }

  return options;
};

const getBodyText = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
): Promise<string> => page.locator('body').innerText({ timeout: 8_000 }).catch(() => '');

const compact = (text: string): string => text.replace(/\s+/g, ' ').trim();

const hasAnyVisible = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  selector: string,
): Promise<boolean> => {
  const count = await page.locator(selector).count().catch(() => 0);

  for (let index = 0; index < Math.min(count, 6); index += 1) {
    const locator = page.locator(selector).nth(index);

    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
};

const verifyCafeMembership = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  cafe: CafeRow,
): Promise<Pick<AuditRow, 'membershipStatus' | 'detail'>> => {
  await page.goto(`https://m.cafe.naver.com/${cafe.cafeUrl}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(2_500);

  if (page.url().includes('nidlogin')) {
    return {
      membershipStatus: 'UNKNOWN',
      detail: '카페 접근 중 로그인 페이지로 이동',
    };
  }

  const text = await getBodyText(page);
  const summary = compact(text).slice(0, 160);
  const joinButtonVisible = await hasAnyVisible(
    page,
    [
      'button:has-text("카페 가입하기")',
      'a:has-text("카페 가입하기")',
      'button:has-text("가입하기")',
      'a:has-text("가입하기")',
      'a[href*="/join"]',
    ].join(', '),
  );

  if (joinButtonVisible) {
    return {
      membershipStatus: 'NOT_JOINED',
      detail: '가입 버튼 보임',
    };
  }

  const memberSignalVisible = await hasAnyVisible(
    page,
    [
      'a:has-text("나의활동")',
      'button:has-text("나의활동")',
      'text=나의활동',
      'a:has-text("글쓰기")',
      'button:has-text("글쓰기")',
      'a[href*="/articles/write"]',
    ].join(', '),
  );

  if (memberSignalVisible || text.includes('나의활동')) {
    return {
      membershipStatus: 'JOINED',
      detail: '회원 UI 확인',
    };
  }

  if (text.includes('카페 가입하기')) {
    return {
      membershipStatus: 'UNKNOWN',
      detail: summary || '가입 문구는 있으나 버튼 노출 불명확',
    };
  }

  if (
    text.includes('접근이 제한') ||
    text.includes('이용이 제한') ||
    text.includes('존재하지 않는 카페')
  ) {
    return {
      membershipStatus: 'UNKNOWN',
      detail: summary || '카페 접근 제한 문구 확인',
    };
  }

  return {
    membershipStatus: 'JOINED',
    detail: '가입 버튼 없음',
  };
};

const checkLogin = async (
  account: AccountRow,
  options: CliOptions,
): Promise<{ success: boolean; detail: string }> => {
  let lastError = '로그인 실패';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    invalidateLoginCache(account.accountId);

    const result = await loginAccount(account.accountId, account.password, {
      forceFreshLogin: options.forceFreshLogin,
      waitForLoginMs: options.loginWaitMs,
      pollIntervalMs: 1_000,
      reason: `all_cafe_membership_audit_${attempt}`,
    });

    if (result.success) {
      return {
        success: true,
        detail: '로그인 성공',
      };
    }

    lastError = result.error || lastError;
    await closeContextForAccount(account.accountId).catch(() => {});
    await sleep(1_500);
  }

  return {
    success: false,
    detail: lastError,
  };
};

const loadAuditTargets = async (
  options: CliOptions,
): Promise<{ accounts: AccountRow[]; cafes: CafeRow[] }> => {
  const user = await User.findOne({ loginId: options.loginId, isActive: true })
    .select('userId')
    .lean<{ userId: string } | null>();

  if (!user) {
    throw new Error(`user not found: ${options.loginId}`);
  }

  const [accounts, cafes] = await Promise.all([
    Account.find({
      userId: user.userId,
      isActive: true,
      ...(options.accountIds.length > 0 && {
        accountId: { $in: options.accountIds },
      }),
    })
      .select('accountId password nickname role')
      .sort({ role: -1, accountId: 1 })
      .lean<AccountRow[]>(),
    Cafe.find({
      userId: user.userId,
      isActive: true,
      ...(options.cafeNames.length > 0 && {
        name: { $in: options.cafeNames },
      }),
    })
      .select('name cafeId cafeUrl')
      .sort({ name: 1 })
      .lean<CafeRow[]>(),
  ]);

  if (accounts.length === 0) {
    throw new Error('검증할 활성 계정이 없습니다.');
  }

  if (cafes.length === 0) {
    throw new Error('검증할 활성 카페가 없습니다.');
  }

  return { accounts, cafes };
};

const printResult = (rows: AuditRow[]): void => {
  const failedLoginAccountIds = Array.from(
    new Set(
      rows
        .filter(({ loginStatus }) => loginStatus === 'FAIL')
        .map(({ accountId }) => accountId),
    ),
  );
  const notJoinedRows = rows.filter(({ membershipStatus }) => membershipStatus === 'NOT_JOINED');
  const unknownRows = rows.filter(({ membershipStatus }) => membershipStatus === 'UNKNOWN');
  const joinedRows = rows.filter(({ membershipStatus }) => membershipStatus === 'JOINED');

  console.log(
    `[ALL_CAFE_MEMBERSHIP_RESULT]${JSON.stringify(
      {
        summary: {
          totalChecks: rows.length,
          joined: joinedRows.length,
          notJoined: notJoinedRows.length,
          unknown: unknownRows.length,
          failedLoginAccounts: failedLoginAccountIds.length,
        },
        failedLoginAccountIds,
        notJoinedRows,
        unknownRows,
        rows,
      },
      null,
      2,
    )}`,
  );
};

const main = async (): Promise<void> => {
  const options = parseCliOptions();

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const { accounts, cafes } = await loadAuditTargets(options);
  const rows: AuditRow[] = [];
  const totalChecks = accounts.length * cafes.length;

  console.log(
    `[ALL_CAFE_MEMBERSHIP] loginId=${options.loginId} accounts=${accounts.length} cafes=${cafes.length} checks=${totalChecks} freshLogin=${options.forceFreshLogin}`,
  );

  for (const [accountIndex, account] of accounts.entries()) {
    console.log(
      `[ALL_CAFE_MEMBERSHIP] account ${accountIndex + 1}/${accounts.length} ${account.accountId}`,
    );
    await acquireAccountLock(account.accountId);

    try {
      const loginResult = await checkLogin(account, options);

      if (!loginResult.success) {
        console.log(`[ALL_CAFE_MEMBERSHIP] ${account.accountId} login FAIL ${loginResult.detail}`);

        cafes.forEach((cafe) => {
          rows.push({
            accountId: account.accountId,
            nickname: account.nickname || account.accountId,
            role: account.role || '-',
            cafeName: cafe.name,
            cafeId: cafe.cafeId,
            loginStatus: 'FAIL',
            membershipStatus: 'SKIPPED',
            detail: loginResult.detail,
          });
        });

        continue;
      }

      const page = await getPageForAccount(account.accountId);

      for (const [cafeIndex, cafe] of cafes.entries()) {
        console.log(
          `[ALL_CAFE_MEMBERSHIP] cafe ${cafeIndex + 1}/${cafes.length} ${account.accountId} / ${cafe.name}`,
        );
        const result = await verifyCafeMembership(page, cafe);

        rows.push({
          accountId: account.accountId,
          nickname: account.nickname || account.accountId,
          role: account.role || '-',
          cafeName: cafe.name,
          cafeId: cafe.cafeId,
          loginStatus: 'OK',
          ...result,
        });
      }
    } finally {
      releaseAccountLock(account.accountId);
    }

    if (accountIndex < accounts.length - 1) {
      await sleep(options.waitBetweenAccountsMs);
    }
  }

  printResult(rows);
  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(
      '[ALL_CAFE_MEMBERSHIP_ERROR]',
      error instanceof Error ? error.message : error,
    );
    await closeAllContexts().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
