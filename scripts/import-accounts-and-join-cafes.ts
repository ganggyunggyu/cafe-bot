import mongoose from 'mongoose';
import { Account, Cafe, User } from '@/shared/models';
import type { AccountRole } from '@/shared/lib/account-manager';

const DEFAULT_LOGIN_ID = '21lab';
const DEFAULT_DAILY_POST_LIMIT = 5;
const DEFAULT_ACTIVITY_HOURS = { start: 0, end: 24 };
const DEFAULT_TARGET_CAFE_NAMES = ['건강한노후준비', '건강관리소', '샤넬오픈런', '쇼핑지름신'];

interface ImportAccountInput {
  accountId: string;
  password: string;
  nickname: string;
  isActive?: boolean;
  dailyPostLimit?: number;
  role?: AccountRole;
}

interface SkippedInputRow {
  label: string;
  reason: string;
}

interface ImportPayload {
  accounts: ImportAccountInput[];
  skippedRows?: SkippedInputRow[];
  targetCafeNames?: string[];
}

interface NormalizedAccount {
  accountId: string;
  password: string;
  nickname: string;
  isActive: boolean;
  dailyPostLimit: number;
  role?: AccountRole;
}

interface ImportSummary {
  created: number;
  updated: number;
  adoptedOrphans: number;
  inactive: number;
  duplicates: string[];
}

interface CafeTarget {
  cafeId: string;
  cafeUrl: string;
  name: string;
}

interface JoinSummary {
  total: number;
  joined: number;
  alreadyMember: number;
  failed: number;
  skippedInactive: number;
}

const args = process.argv.slice(2);
let closeAllContextsForCleanup: (() => Promise<void>) | undefined;

const hasFlag = (flag: string): boolean => args.includes(`--${flag}`);

const readArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inlineArg = args.find((arg) => arg.startsWith(prefix));

  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
};

const readStdinLine = async (): Promise<string> => {
  let buffer = '';
  const shouldRestoreRawMode = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

  if (shouldRestoreRawMode) {
    process.stdin.setRawMode(true);
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      process.stdin.off('data', handleData);
      process.stdin.off('error', handleError);
      if (shouldRestoreRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    const handleData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const lineBreakIndex = buffer.indexOf('\n');

      if (lineBreakIndex === -1) {
        return;
      }

      cleanup();
      resolve(buffer.slice(0, lineBreakIndex));
    };

    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    process.stdin.on('data', handleData);
    process.stdin.on('error', handleError);
    process.stdin.resume();
  });
};

const parsePayload = async (): Promise<ImportPayload | null> => {
  if (!hasFlag('stdin')) {
    return null;
  }

  const raw = await readStdinLine();
  const parsed = JSON.parse(raw) as ImportPayload;

  if (!Array.isArray(parsed.accounts)) {
    throw new Error('accounts 배열이 필요합니다.');
  }

  return parsed;
};

const normalizeAccount = (account: ImportAccountInput): NormalizedAccount => {
  const accountId = account.accountId.trim();
  const password = account.password.trim();
  const nickname = account.nickname.trim();
  const isActive = account.isActive ?? true;
  const dailyPostLimit = account.dailyPostLimit ?? DEFAULT_DAILY_POST_LIMIT;
  const role = account.role;

  if (!accountId || !password) {
    throw new Error(`계정 ID/PW 누락: ${nickname || accountId || 'unknown'}`);
  }

  return {
    accountId,
    password,
    nickname,
    isActive,
    dailyPostLimit,
    ...(role ? { role } : {}),
  };
};

const dedupeAccounts = (
  accounts: ImportAccountInput[]
): { uniqueAccounts: NormalizedAccount[]; duplicates: string[] } => {
  const seenAccountIds = new Set<string>();
  const uniqueAccounts: NormalizedAccount[] = [];
  const duplicates: string[] = [];

  for (const account of accounts) {
    const normalized = normalizeAccount(account);

    if (seenAccountIds.has(normalized.accountId)) {
      duplicates.push(`${normalized.accountId} (${normalized.nickname})`);
      continue;
    }

    seenAccountIds.add(normalized.accountId);
    uniqueAccounts.push(normalized);
  }

  return { uniqueAccounts, duplicates };
};

const connect = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI 환경변수가 필요합니다.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
};

const getUserId = async (loginId: string): Promise<string> => {
  const user = await User.findOne({ loginId, isActive: true })
    .select('userId loginId')
    .lean<{ userId: string; loginId: string } | null>();

  if (!user) {
    throw new Error(`사용자를 찾을 수 없습니다: ${loginId}`);
  }

  return user.userId;
};

const parseAccountIds = (): string[] => {
  const accountIdsValue = readArg('account-ids');

  if (!accountIdsValue) {
    return [];
  }

  return accountIdsValue
    .split(',')
    .map((accountId) => accountId.trim())
    .filter(Boolean);
};

const loadAccountsByIds = async (
  userId: string,
  accountIds: string[]
): Promise<NormalizedAccount[]> => {
  if (accountIds.length === 0) {
    throw new Error('--account-ids 값이 필요합니다.');
  }

  const accounts = await Account.find({ userId, accountId: { $in: accountIds } })
    .select('accountId password nickname isActive dailyPostLimit role')
    .lean<
      Array<{
        accountId: string;
        password: string;
        nickname?: string;
        isActive?: boolean;
        dailyPostLimit?: number;
        role?: AccountRole;
      }>
    >();
  const accountById = new Map(accounts.map((account) => [account.accountId, account]));
  const missingAccountIds = accountIds.filter((accountId) => !accountById.has(accountId));

  if (missingAccountIds.length > 0) {
    console.log(`[JOIN] DB에 없는 계정 ${missingAccountIds.length}개 스킵: ${missingAccountIds.join(', ')}`);
  }

  return accountIds.flatMap((accountId) => {
    const account = accountById.get(accountId);

    if (!account) {
      return [];
    }

    return [
      {
        accountId: account.accountId,
        password: account.password,
        nickname: account.nickname || account.accountId,
        isActive: account.isActive ?? true,
        dailyPostLimit: account.dailyPostLimit ?? DEFAULT_DAILY_POST_LIMIT,
        ...(account.role ? { role: account.role } : {}),
      },
    ];
  });
};

const buildAccountUpdate = (
  userId: string,
  account: NormalizedAccount,
  defaultRole?: AccountRole
) => {
  const role = account.role ?? defaultRole;

  return {
    userId,
    accountId: account.accountId,
    password: account.password,
    nickname: account.nickname,
    isActive: account.isActive,
    isMain: false,
    ...(role ? { role } : {}),
    dailyPostLimit: account.dailyPostLimit,
    activityHours: DEFAULT_ACTIVITY_HOURS,
    restDays: [],
  };
};

const upsertAccount = async (
  userId: string,
  account: NormalizedAccount
): Promise<'created' | 'updated' | 'adoptedOrphan'> => {
  const existingForUser = await Account.findOne({
    userId,
    accountId: account.accountId,
  })
    .select('_id')
    .lean();

  if (existingForUser) {
    const update = buildAccountUpdate(userId, account);
    await Account.updateOne({ userId, accountId: account.accountId }, { $set: update });
    return 'updated';
  }

  const orphanAccount = await Account.findOne({
    accountId: account.accountId,
    $or: [
      { userId: { $exists: false } },
      { userId: null },
      { userId: '' },
    ],
  })
    .select('_id')
    .lean();

  if (orphanAccount) {
    const update = buildAccountUpdate(userId, account);
    await Account.updateOne({ _id: orphanAccount._id }, { $set: update });
    return 'adoptedOrphan';
  }

  const update = buildAccountUpdate(userId, account, 'commenter');
  await Account.create(update);
  return 'created';
};

const importAccounts = async (
  userId: string,
  accounts: NormalizedAccount[],
  duplicates: string[]
): Promise<ImportSummary> => {
  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    adoptedOrphans: 0,
    inactive: accounts.filter(({ isActive }) => !isActive).length,
    duplicates,
  };

  for (const account of accounts) {
    const result = await upsertAccount(userId, account);

    if (result === 'created') {
      summary.created += 1;
      console.log(`[IMPORT] ${account.accountId}: 신규`);
      continue;
    }

    if (result === 'adoptedOrphan') {
      summary.adoptedOrphans += 1;
      console.log(`[IMPORT] ${account.accountId}: userId 없는 기존 계정 연결`);
      continue;
    }

    summary.updated += 1;
    console.log(`[IMPORT] ${account.accountId}: 업데이트`);
  }

  return summary;
};

const getTargetCafeNames = (payload: ImportPayload | null): string[] => {
  const argValue = readArg('target-cafes');

  if (argValue) {
    return argValue.split(',').map((name) => name.trim()).filter(Boolean);
  }

  return payload?.targetCafeNames?.length ? payload.targetCafeNames : DEFAULT_TARGET_CAFE_NAMES;
};

const loadTargetCafes = async (
  userId: string,
  targetCafeNames: string[]
): Promise<CafeTarget[]> => {
  const cafes = await Cafe.find({
    userId,
    isActive: true,
    name: { $in: targetCafeNames },
  })
    .select('name cafeId cafeUrl')
    .lean<Array<{ name: string; cafeId: string; cafeUrl: string }>>();
  const cafeByName = new Map(cafes.map((cafe) => [cafe.name, cafe]));
  const missingCafeNames = targetCafeNames.filter((name) => !cafeByName.has(name));

  if (missingCafeNames.length > 0) {
    throw new Error(`대상 카페 없음: ${missingCafeNames.join(', ')}`);
  }

  return targetCafeNames.map((name) => {
    const cafe = cafeByName.get(name);

    if (!cafe) {
      throw new Error(`대상 카페 없음: ${name}`);
    }

    return {
      cafeId: cafe.cafeId,
      cafeUrl: cafe.cafeUrl,
      name: cafe.name,
    };
  });
};

const joinImportedAccounts = async (
  accounts: NormalizedAccount[],
  cafes: CafeTarget[]
): Promise<JoinSummary> => {
  const { joinCafeWithAccount } = await import('@/features/auto-comment/batch');
  const { closeAllContexts } = await import('@/shared/lib/multi-session');

  closeAllContextsForCleanup = closeAllContexts;

  const activeAccounts = accounts.filter(({ isActive }) => isActive);
  const summary: JoinSummary = {
    total: activeAccounts.length * cafes.length,
    joined: 0,
    alreadyMember: 0,
    failed: 0,
    skippedInactive: accounts.length - activeAccounts.length,
  };

  try {
    for (const account of activeAccounts) {
      for (const cafe of cafes) {
        console.log(`[JOIN] ${account.accountId} -> ${cafe.name} 시작`);
        const result = await joinCafeWithAccount(
          {
            id: account.accountId,
            password: account.password,
            nickname: account.nickname || account.accountId,
            dailyPostLimit: account.dailyPostLimit,
            role: account.role,
          },
          cafe.cafeId,
          { cafeUrl: cafe.cafeUrl }
        );

        if (result.alreadyMember) {
          summary.alreadyMember += 1;
          console.log(`[JOIN] ${account.accountId} -> ${cafe.name}: 이미 회원`);
        } else if (result.success) {
          summary.joined += 1;
          console.log(`[JOIN] ${account.accountId} -> ${cafe.name}: 가입 완료`);
        } else {
          summary.failed += 1;
          console.log(`[JOIN] ${account.accountId} -> ${cafe.name}: 실패 - ${result.error}`);
        }

        await new Promise((resolve) => {
          setTimeout(resolve, 3000);
        });
      }
    }

    return summary;
  } finally {
    await closeAllContexts();
    closeAllContextsForCleanup = undefined;
  }
};

const main = async (): Promise<void> => {
  const payload = await parsePayload();
  const loginId = readArg('login-id') ?? DEFAULT_LOGIN_ID;
  const shouldJoin = hasFlag('join');
  const joinOnly = hasFlag('join-only');

  if (!payload && !joinOnly) {
    throw new Error('--stdin 입력이 필요합니다.');
  }

  await connect();

  const userId = await getUserId(loginId);
  let accountsForJoin: NormalizedAccount[] = [];

  if (payload) {
    const { uniqueAccounts, duplicates } = dedupeAccounts(payload.accounts);
    accountsForJoin = uniqueAccounts;

    console.log(`[IMPORT] 대상 사용자: ${loginId} (${userId})`);
    console.log(`[IMPORT] 입력 ${payload.accounts.length}개, 유효 ${uniqueAccounts.length}개, 중복 ${duplicates.length}개`);

    if (payload.skippedRows?.length) {
      console.log(`[IMPORT] ID/PW 없는 행 ${payload.skippedRows.length}개 스킵`);
      for (const row of payload.skippedRows) {
        console.log(`[IMPORT] 스킵: ${row.label} - ${row.reason}`);
      }
    }

    const importSummary = await importAccounts(userId, uniqueAccounts, duplicates);

    console.log(
      `[IMPORT] 완료: 신규 ${importSummary.created}, 업데이트 ${importSummary.updated}, ` +
        `연결 ${importSummary.adoptedOrphans}, 비활성 ${importSummary.inactive}, 중복스킵 ${importSummary.duplicates.length}`
    );
  } else {
    accountsForJoin = await loadAccountsByIds(userId, parseAccountIds());
    console.log(`[JOIN] 대상 사용자: ${loginId} (${userId})`);
    console.log(`[JOIN] DB 계정 로드: ${accountsForJoin.length}개`);
  }

  if (!shouldJoin) {
    await mongoose.disconnect();
    return;
  }

  const targetCafeNames = getTargetCafeNames(payload);
  const cafes = await loadTargetCafes(userId, targetCafeNames);

  console.log(`[JOIN] 대상 카페: ${cafes.map(({ name }) => name).join(', ')}`);

  const joinSummary = await joinImportedAccounts(accountsForJoin, cafes);

  console.log(
    `[JOIN] 완료: 총 ${joinSummary.total}, 가입 ${joinSummary.joined}, 이미회원 ${joinSummary.alreadyMember}, ` +
      `실패 ${joinSummary.failed}, 비활성스킵 ${joinSummary.skippedInactive}`
  );

  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[IMPORT] 실패: ${errorMessage}`);
    await closeAllContextsForCleanup?.().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
