import { writeFileSync } from 'fs';
import mongoose from 'mongoose';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  invalidateLoginCache,
  loginAccount,
  releaseAccountLock,
} from '../src/shared/lib/multi-session';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { User } from '../src/shared/models/user';

interface AccountRow {
  accountId: string;
  password: string;
  nickname?: string;
  role?: string;
  isActive?: boolean;
}

interface CafeRow {
  name: string;
  cafeId: string;
  cafeUrl: string;
  menuId: string;
}

interface ResultRow {
  accountId: string;
  nickname: string;
  role: string;
  cafeName: string;
  cafeId: string;
  loginStatus: 'OK' | 'FAIL';
  membershipStatus: 'JOINED' | 'NOT_JOINED' | 'UNKNOWN' | 'SKIPPED';
  writeStatus: 'WRITE_OK' | 'WRITE_BLOCKED' | 'UNKNOWN' | 'SKIPPED';
  detail: string;
}

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const TARGET_CAFE_NAMES = (process.env.TARGET_CAFE_NAMES || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const FORCE_FRESH_LOGIN = process.env.FORCE_FRESH_LOGIN !== 'false';
const LOGIN_WAIT_MS = Number(process.env.LOGIN_WAIT_MS || 45_000);
const RESULT_PATH =
  process.env.RESULT_PATH ||
  `work/cafe-all-account-write-access-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .slice(0, 13)}.json`;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const compact = (text: string): string => text.replace(/\s+/g, ' ').trim();

const getBodyText = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
): Promise<string> => page.locator('body').innerText({ timeout: 8_000 }).catch(() => '');

const hasAnyVisible = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  selector: string,
): Promise<boolean> => {
  const count = await page.locator(selector).count().catch(() => 0);

  for (let index = 0; index < Math.min(count, 8); index += 1) {
    if (await page.locator(selector).nth(index).isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
};

const verifyMembership = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  cafe: CafeRow,
): Promise<{ status: ResultRow['membershipStatus']; detail: string }> => {
  await page.goto(`https://m.cafe.naver.com/${cafe.cafeUrl}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  }).catch(() => {});
  await sleep(2_500);

  const text = compact(await getBodyText(page));
  const joinVisible = await hasAnyVisible(
    page,
    [
      'button:has-text("카페 가입하기")',
      'a:has-text("카페 가입하기")',
      'button:has-text("가입하기")',
      'a:has-text("가입하기")',
      'a[href*="/join"]',
    ].join(', '),
  );
  const activityVisible = await hasAnyVisible(
    page,
    'a:has-text("나의활동"), button:has-text("나의활동"), text=나의활동',
  );
  const writeVisible = await hasAnyVisible(
    page,
    'a:has-text("글쓰기"), button:has-text("글쓰기"), a[href*="/articles/write"], a[href*="write"]',
  );

  if (joinVisible) {
    return { status: 'NOT_JOINED', detail: '가입 버튼 보임' };
  }

  if (activityVisible || writeVisible || text.includes('나의활동')) {
    return {
      status: 'JOINED',
      detail: activityVisible ? '나의활동 표시' : '회원/글쓰기 UI 확인',
    };
  }

  return {
    status: 'UNKNOWN',
    detail: text.slice(0, 120) || `url=${page.url()}`,
  };
};

const verifyWriteAccess = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  cafe: CafeRow,
): Promise<{ status: ResultRow['writeStatus']; detail: string }> => {
  const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}/articles/write?boardType=L&menuId=${cafe.menuId}`;

  await page.goto(writeUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  }).catch(() => {});
  await sleep(4_000);

  const text = compact(await getBodyText(page));
  const finalUrl = page.url();
  const titleInputVisible = await hasAnyVisible(
    page,
    [
      '.FlexableTextArea textarea.textarea_input',
      'textarea.textarea_input',
      'textarea[placeholder*="제목"]',
      '[contenteditable="true"]',
    ].join(', '),
  );
  const editorTextSignal =
    text.includes('카페 글쓰기') &&
    text.includes('등록') &&
    (text.includes('임시등록') || text.includes('게시판') || text.includes('말머리'));
  const blockedText =
    text.includes('글쓰기 권한이 없습니다') ||
    text.includes('글쓰기 제한') ||
    text.includes('글쓰기가 제한') ||
    text.includes('접근할 수 없습니다') ||
    text.includes('카페 회원만') ||
    text.includes('가입 후 이용') ||
    text.includes('등급이 부족') ||
    text.includes('등급 이상') ||
    text.includes('등업');

  if (finalUrl.includes('nidlogin')) {
    return {
      status: 'WRITE_BLOCKED',
      detail: '글쓰기 URL에서 로그인 페이지로 이동',
    };
  }

  if ((titleInputVisible || editorTextSignal) && !blockedText) {
    return {
      status: 'WRITE_OK',
      detail: '글쓰기 에디터 진입 가능',
    };
  }

  if (blockedText) {
    return {
      status: 'WRITE_BLOCKED',
      detail: text.slice(0, 160),
    };
  }

  return {
    status: 'UNKNOWN',
    detail: `finalUrl=${finalUrl} / text=${text.slice(0, 140)}`,
  };
};

const getTargets = async (): Promise<{ accounts: AccountRow[]; cafes: CafeRow[] }> => {
  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true })
    .select('userId')
    .lean<{ userId: string } | null>();

  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const cafeFilter =
    TARGET_CAFE_NAMES.length > 0 ? { name: { $in: TARGET_CAFE_NAMES } } : {};
  const [accounts, cafes] = await Promise.all([
    Account.find({ userId: user.userId, isActive: true })
      .select('accountId password nickname role isActive')
      .sort({ role: -1, accountId: 1 })
      .lean<AccountRow[]>(),
    Cafe.find({ userId: user.userId, isActive: true, ...cafeFilter })
      .select('name cafeId cafeUrl menuId')
      .sort({ name: 1 })
      .lean<CafeRow[]>(),
  ]);

  const cafeByName = new Map(cafes.map((cafe) => [cafe.name, cafe]));
  const orderedCafes =
    TARGET_CAFE_NAMES.length > 0
      ? TARGET_CAFE_NAMES.map((name) => {
          const cafe = cafeByName.get(name);
          if (!cafe) {
            throw new Error(`cafe not found: ${name}`);
          }
          return cafe;
        })
      : cafes;

  return { accounts, cafes: orderedCafes };
};

const main = async (): Promise<void> => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
  });

  const { accounts, cafes } = await getTargets();
  const rows: ResultRow[] = [];

  console.log(
    `[ALL_CAFE_WRITE_CHECK] accounts=${accounts.length}, cafes=${cafes
      .map(({ name }) => name)
      .join(', ')}, forceFreshLogin=${FORCE_FRESH_LOGIN}`,
  );

  for (const [index, account] of accounts.entries()) {
    console.log(
      `[ACCOUNT] ${index + 1}/${accounts.length} ${account.accountId} (${account.role || '-'})`,
    );
    await acquireAccountLock(account.accountId);

    try {
      invalidateLoginCache(account.accountId);
      const login = await loginAccount(account.accountId, account.password, {
        forceFreshLogin: FORCE_FRESH_LOGIN,
        waitForLoginMs: LOGIN_WAIT_MS,
        pollIntervalMs: 1_000,
        reason: 'all_cafe_account_write_access_check',
      });

      if (!login.success) {
        for (const cafe of cafes) {
          rows.push({
            accountId: account.accountId,
            nickname: account.nickname || account.accountId,
            role: account.role || '-',
            cafeName: cafe.name,
            cafeId: cafe.cafeId,
            loginStatus: 'FAIL',
            membershipStatus: 'SKIPPED',
            writeStatus: 'SKIPPED',
            detail: login.error || '로그인 실패',
          });
        }
        continue;
      }

      const page = await getPageForAccount(account.accountId);

      for (const cafe of cafes) {
        console.log(`[CAFE] ${account.accountId} / ${cafe.name}`);
        const membership = await verifyMembership(page, cafe);
        const write = await verifyWriteAccess(page, cafe);

        rows.push({
          accountId: account.accountId,
          nickname: account.nickname || account.accountId,
          role: account.role || '-',
          cafeName: cafe.name,
          cafeId: cafe.cafeId,
          loginStatus: 'OK',
          membershipStatus: membership.status,
          writeStatus: write.status,
          detail: `membership=${membership.detail} / write=${write.detail}`,
        });
      }
    } finally {
      releaseAccountLock(account.accountId);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    resultPath: RESULT_PATH,
    totalAccounts: accounts.length,
    totalCafes: cafes.length,
    totalChecks: rows.length,
    loginOkAccounts: new Set(rows.filter(({ loginStatus }) => loginStatus === 'OK').map(({ accountId }) => accountId)).size,
    loginFailAccounts: new Set(rows.filter(({ loginStatus }) => loginStatus === 'FAIL').map(({ accountId }) => accountId)).size,
    writeOk: rows.filter(({ writeStatus }) => writeStatus === 'WRITE_OK').length,
    writeBlocked: rows.filter(({ writeStatus }) => writeStatus === 'WRITE_BLOCKED').length,
    unknown: rows.filter(({ writeStatus }) => writeStatus === 'UNKNOWN').length,
    byCafe: cafes.map((cafe) => {
      const cafeRows = rows.filter(({ cafeId }) => cafeId === cafe.cafeId);
      return {
        cafeName: cafe.name,
        cafeId: cafe.cafeId,
        writeOkAccounts: cafeRows
          .filter(({ writeStatus }) => writeStatus === 'WRITE_OK')
          .map(({ accountId, nickname, role }) => ({ accountId, nickname, role })),
        notJoinedAccounts: cafeRows
          .filter(({ membershipStatus }) => membershipStatus === 'NOT_JOINED')
          .map(({ accountId, nickname, role }) => ({ accountId, nickname, role })),
        writeBlockedCount: cafeRows.filter(({ writeStatus }) => writeStatus === 'WRITE_BLOCKED').length,
        unknownCount: cafeRows.filter(({ writeStatus }) => writeStatus === 'UNKNOWN').length,
      };
    }),
  };

  const report = { summary, rows };
  writeFileSync(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[ALL_CAFE_WRITE_CHECK_RESULT]${JSON.stringify(summary, null, 2)}`);

  await closeAllContexts().catch(() => {});
  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[ALL_CAFE_WRITE_CHECK]', error instanceof Error ? error.message : error);
    await closeAllContexts().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
