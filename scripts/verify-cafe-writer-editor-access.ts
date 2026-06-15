import mongoose from 'mongoose';

import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import {
  getCafeWriterAccounts,
  LUXURY_CAFE_WRITER_ACCOUNT_IDS,
} from '@/shared/config/cafe-account-policy';
import { Account } from '@/shared/models/account';
import { Cafe } from '@/shared/models/cafe';
import { User } from '@/shared/models/user';

interface AccountRow {
  accountId: string;
  password?: string;
  nickname?: string;
  role?: NaverAccount['role'];
  isActive?: boolean;
  isMain?: boolean;
  dailyPostLimit?: number;
  activityHours?: NaverAccount['activityHours'];
  restDays?: number[];
  personaId?: string;
}

interface CafeRow {
  name: string;
  cafeId: string;
  cafeUrl: string;
  menuId: string;
}

interface CheckRow {
  accountId: string;
  nickname: string;
  cafeName: string;
  cafeId: string;
  dbStatus: 'ACTIVE' | 'INACTIVE' | 'MISSING';
  loginStatus: 'OK' | 'FAIL';
  editorStatus: 'EDITOR_OK' | 'WRITE_BLOCKED' | 'UNKNOWN' | 'SKIPPED';
  detail: string;
}

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const DEFAULT_TARGET_CAFE_NAMES = ['샤넬오픈런', '쇼핑지름신'];
const TARGET_CAFE_NAMES = (process.env.TARGET_CAFE_NAMES || DEFAULT_TARGET_CAFE_NAMES.join(','))
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const LOGIN_WAIT_MS = Number(process.env.LOGIN_WAIT_MS || 60_000);
const FORCE_FRESH_LOGIN = process.env.FORCE_FRESH_LOGIN === 'true';

const compact = (text: string): string => text.replace(/\s+/g, ' ').trim();

const hasAnyVisible = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  selector: string,
): Promise<boolean> => {
  const count = await page.locator(selector).count().catch(() => 0);

  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const locator = page.locator(selector).nth(index);

    if (await locator.isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
};

const clickFirstVisible = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  selector: string,
): Promise<boolean> => {
  const count = await page.locator(selector).count().catch(() => 0);

  for (let index = 0; index < Math.min(count, 8); index += 1) {
    const locator = page.locator(selector).nth(index);

    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 5_000 }).catch(() => {});
      return true;
    }
  }

  return false;
};

const toPolicyAccount = (account: AccountRow): NaverAccount => ({
  id: account.accountId,
  password: account.password || '',
  nickname: account.nickname,
  isMain: account.isMain,
  activityHours: account.activityHours,
  restDays: account.restDays,
  dailyPostLimit: account.dailyPostLimit,
  personaId: account.personaId,
  role: account.role,
});

const getBodyText = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
): Promise<string> => page.locator('body').innerText({ timeout: 8_000 }).catch(() => '');

const ensureLoggedIn = async (account: AccountRow): Promise<{ ok: boolean; detail: string }> => {
  if (account.password) {
    const result = await loginAccount(account.accountId, account.password, {
      forceFreshLogin: FORCE_FRESH_LOGIN,
      waitForLoginMs: LOGIN_WAIT_MS,
      pollIntervalMs: 1_000,
      reason: 'cafe_writer_editor_access',
    });

    return {
      ok: result.success,
      detail: result.success ? '로그인 확인' : result.error || '로그인 실패',
    };
  }

  const loggedIn = await isAccountLoggedIn(account.accountId);

  return {
    ok: loggedIn,
    detail: loggedIn ? '저장 세션으로 로그인 확인' : 'DB 계정/비밀번호 없음, 저장 세션 로그인 실패',
  };
};

const readEditorState = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
): Promise<{
  hasEditorSignal: boolean;
  hasBlockedText: boolean;
  detail: string;
}> => {
  const bodyText = await getBodyText(page);
  const summary = compact(bodyText);
  const hasTitleInput = await hasAnyVisible(
    page,
    [
      '.FlexableTextArea textarea.textarea_input',
      'textarea.textarea_input',
      'textarea[placeholder*="제목"]',
    ].join(', '),
  );
  const hasBodyInput = await hasAnyVisible(
    page,
    [
      'p.se-text-paragraph',
      '[contenteditable="true"]',
      '.se-component-content',
    ].join(', '),
  );
  const hasEditorTextSignal =
    summary.includes('카페 글쓰기') &&
    summary.includes('등록') &&
    (summary.includes('임시등록') || summary.includes('게시판'));
  const hasBlockedText =
    summary.includes('글쓰기 권한이 없습니다') ||
    summary.includes('글쓰기 제한') ||
    summary.includes('접근할 수 없습니다') ||
    summary.includes('카페 회원만') ||
    summary.includes('가입 후 이용') ||
    summary.includes('등급이 부족') ||
    summary.includes('등급 이상') ||
    summary.includes('등업');

  return {
    hasEditorSignal: (hasTitleInput && hasBodyInput) || hasEditorTextSignal,
    hasBlockedText,
    detail: summary.slice(0, 160) || `url=${page.url()}`,
  };
};

const verifyEditorAccess = async (
  accountId: string,
  cafe: CafeRow,
): Promise<Pick<CheckRow, 'editorStatus' | 'detail'>> => {
  const page = await getPageForAccount(accountId);
  const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}/articles/write?boardType=L&menuId=${cafe.menuId}`;

  await page.goto(writeUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(3_500);

  let state = await readEditorState(page);

  if (!state.hasEditorSignal && !state.hasBlockedText) {
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);

    const clicked = await clickFirstVisible(
      page,
      'a:has-text("글쓰기"), button:has-text("글쓰기"), a[href*="/articles/write"]',
    );

    if (clicked) {
      await page.waitForTimeout(3_500);
      state = await readEditorState(page);
    }
  }

  if (page.url().includes('nidlogin')) {
    return {
      editorStatus: 'WRITE_BLOCKED',
      detail: '글쓰기 진입 중 로그인 페이지로 이동',
    };
  }

  if (state.hasEditorSignal && !state.hasBlockedText) {
    return {
      editorStatus: 'EDITOR_OK',
      detail: '글쓰기 에디터 진입 가능',
    };
  }

  if (state.hasBlockedText) {
    return {
      editorStatus: 'WRITE_BLOCKED',
      detail: state.detail,
    };
  }

  return {
    editorStatus: 'UNKNOWN',
    detail: state.detail,
  };
};

const loadTargets = async (): Promise<{
  accounts: AccountRow[];
  cafes: CafeRow[];
}> => {
  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true })
    .select('userId')
    .lean<{ userId: string } | null>();

  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const [accounts, cafes] = await Promise.all([
    Account.find({ userId: user.userId })
      .select('accountId password nickname role isActive isMain dailyPostLimit activityHours restDays personaId')
      .lean<AccountRow[]>(),
    Cafe.find({
      userId: user.userId,
      isActive: true,
      name: { $in: TARGET_CAFE_NAMES },
    })
      .select('name cafeId cafeUrl menuId')
      .lean<CafeRow[]>(),
  ]);

  const cafeByName = new Map(cafes.map((cafe) => [cafe.name, cafe]));
  const orderedCafes = TARGET_CAFE_NAMES.map((name) => {
    const cafe = cafeByName.get(name);

    if (!cafe) {
      throw new Error(`cafe not found: ${name}`);
    }

    return cafe;
  });

  return { accounts, cafes: orderedCafes };
};

const main = async (): Promise<void> => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const { accounts, cafes } = await loadTargets();
  const accountById = new Map(accounts.map((account) => [account.accountId, account]));
  const activePolicyAccounts = accounts
    .filter(({ isActive }) => isActive)
    .map(toPolicyAccount);
  const writerIdsByCafeName = new Map<string, string[]>();
  const expectedLuxuryIds = new Set<string>([...LUXURY_CAFE_WRITER_ACCOUNT_IDS]);

  for (const cafe of cafes) {
    const writerIds = getCafeWriterAccounts(activePolicyAccounts, cafe.cafeId)
      .map(({ id }) => id);
    const requiredIds = new Set<string>(writerIds);

    if (cafe.name === '샤넬오픈런' || cafe.name === '쇼핑지름신') {
      for (const id of expectedLuxuryIds) {
        requiredIds.add(id);
      }
    }

    writerIdsByCafeName.set(cafe.name, [...requiredIds]);
  }

  const rows: CheckRow[] = [];

  for (const cafe of cafes) {
    const writerIds = writerIdsByCafeName.get(cafe.name) ?? [];

    for (const accountId of writerIds) {
      const dbAccount = accountById.get(accountId);
      const account: AccountRow = dbAccount ?? {
        accountId,
        nickname: accountId,
        isActive: false,
      };
      const dbStatus = dbAccount?.isActive ? 'ACTIVE' : dbAccount ? 'INACTIVE' : 'MISSING';

      await acquireAccountLock(accountId);

      try {
        const login = await ensureLoggedIn(account);

        if (!login.ok) {
          rows.push({
            accountId,
            nickname: account.nickname || accountId,
            cafeName: cafe.name,
            cafeId: cafe.cafeId,
            dbStatus,
            loginStatus: 'FAIL',
            editorStatus: 'SKIPPED',
            detail: login.detail,
          });
          continue;
        }

        const editor = await verifyEditorAccess(accountId, cafe);
        rows.push({
          accountId,
          nickname: account.nickname || accountId,
          cafeName: cafe.name,
          cafeId: cafe.cafeId,
          dbStatus,
          loginStatus: 'OK',
          editorStatus: editor.editorStatus,
          detail: editor.detail,
        });
      } finally {
        releaseAccountLock(accountId);
      }
    }
  }

  console.log(
    `[CAFE_WRITER_EDITOR_RESULT]${JSON.stringify(
      {
        targetCafes: cafes.map(({ name, cafeId }) => ({ name, cafeId })),
        policyWriterIdsByCafe: Object.fromEntries(
          cafes.map((cafe) => [
            cafe.name,
            getCafeWriterAccounts(activePolicyAccounts, cafe.cafeId).map(({ id }) => id),
          ]),
        ),
        expectedLuxuryWriterIds: [...LUXURY_CAFE_WRITER_ACCOUNT_IDS],
        summary: {
          totalChecks: rows.length,
          editorOk: rows.filter(({ editorStatus }) => editorStatus === 'EDITOR_OK').length,
          loginFail: rows.filter(({ loginStatus }) => loginStatus === 'FAIL').length,
          writeBlocked: rows.filter(({ editorStatus }) => editorStatus === 'WRITE_BLOCKED').length,
          unknown: rows.filter(({ editorStatus }) => editorStatus === 'UNKNOWN').length,
          dbMissing: rows.filter(({ dbStatus }) => dbStatus === 'MISSING').length,
          dbInactive: rows.filter(({ dbStatus }) => dbStatus === 'INACTIVE').length,
        },
        rows,
      },
      null,
      2,
    )}`,
  );

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[CAFE_WRITER_EDITOR_ACCESS]', error instanceof Error ? error.message : error);
    await closeAllContexts().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
