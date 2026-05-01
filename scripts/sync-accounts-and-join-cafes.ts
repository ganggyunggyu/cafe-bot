import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { User } from '../src/shared/models/user';
import { joinCafeWithAccount } from '../src/features/auto-comment/batch/cafe-join';
import {
  closeAllContexts,
  closeContextForAccount,
  loginAccount,
} from '../src/shared/lib/multi-session';
import type { AccountRole } from '../src/shared/models/account';

interface SyncAccountInput {
  accountId: string;
  password: string;
  nickname: string;
}

interface SyncPayload {
  accounts: SyncAccountInput[];
  writerAccountIds?: string[];
  targetCafeNames?: string[];
  loginId?: string;
}

interface NormalizedAccount {
  accountId: string;
  password: string;
  nickname: string;
  role: AccountRole;
}

interface CafeTarget {
  cafeId: string;
  cafeUrl: string;
  name: string;
}

const DEFAULT_LOGIN_ID = '21lab';
const DEFAULT_WRITER_ACCOUNT_IDS = [
  'angrykoala270',
  'tinyfish183',
  'nes1p2kx',
  'mh8j62wm',
  'regular14631',
];

const readStdinLine = async (): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = (): void => {
      process.stdin.off('data', handleData);
      process.stdin.off('end', handleEnd);
      process.stdin.off('error', handleError);
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
    const handleEnd = (): void => {
      cleanup();
      resolve(buffer);
    };
    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    process.stdin.on('data', handleData);
    process.stdin.on('end', handleEnd);
    process.stdin.on('error', handleError);
    process.stdin.resume();
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const normalizeNickname = (nickname: string, accountId: string): string => {
  const normalized = nickname.replace(/\s*\(\d+개\)\s*$/u, '').trim();

  return normalized || accountId;
};

const parsePayload = async (): Promise<SyncPayload> => {
  const raw = (await readStdinLine()).trim();

  if (!raw) {
    throw new Error('stdin JSON payload가 필요합니다.');
  }

  const payload = JSON.parse(raw) as SyncPayload;

  if (!Array.isArray(payload.accounts) || payload.accounts.length === 0) {
    throw new Error('accounts 배열이 필요합니다.');
  }

  return payload;
};

const buildAccounts = (payload: SyncPayload): NormalizedAccount[] => {
  const writerAccountIds = new Set(payload.writerAccountIds ?? DEFAULT_WRITER_ACCOUNT_IDS);
  const seenAccountIds = new Set<string>();
  const accounts: NormalizedAccount[] = [];

  for (const account of payload.accounts) {
    const accountId = account.accountId.trim();
    const password = account.password.trim();

    if (!accountId || !password) {
      throw new Error(`계정 ID/PW 누락: ${account.nickname || accountId || 'unknown'}`);
    }

    if (seenAccountIds.has(accountId)) {
      continue;
    }

    seenAccountIds.add(accountId);
    accounts.push({
      accountId,
      password,
      nickname: normalizeNickname(account.nickname, accountId),
      role: writerAccountIds.has(accountId) ? 'writer' : 'commenter',
    });
  }

  return accounts;
};

const getUserId = async (loginId: string): Promise<string> => {
  const user = await User.findOne({ loginId, isActive: true })
    .select('userId')
    .lean<{ userId: string } | null>();

  if (!user) {
    throw new Error(`사용자를 찾을 수 없습니다: ${loginId}`);
  }

  return user.userId;
};

const upsertAccounts = async (
  userId: string,
  accounts: NormalizedAccount[],
): Promise<{ created: number; updated: number }> => {
  let created = 0;
  let updated = 0;

  for (const account of accounts) {
    const existing = await Account.findOne({ userId, accountId: account.accountId })
      .select('_id')
      .lean<{ _id: mongoose.Types.ObjectId } | null>();
    const update = {
      userId,
      accountId: account.accountId,
      password: account.password,
      nickname: account.nickname,
      role: account.role,
      isActive: true,
    };

    if (existing) {
      await Account.updateOne({ _id: existing._id }, { $set: update });
      updated += 1;
      console.log(`[SYNC] ${account.accountId}: 업데이트 (${account.role})`);
      continue;
    }

    await Account.create({
      ...update,
      isMain: false,
      dailyPostLimit: 5,
      activityHours: { start: 0, end: 24 },
      restDays: [],
    });
    created += 1;
    console.log(`[SYNC] ${account.accountId}: 신규 (${account.role})`);
  }

  return { created, updated };
};

const loadTargetCafes = async (
  userId: string,
  targetCafeNames: string[] | undefined,
): Promise<CafeTarget[]> => {
  const cafes = await Cafe.find({
    userId,
    isActive: true,
    ...(targetCafeNames?.length && { name: { $in: targetCafeNames } }),
  })
    .select('name cafeId cafeUrl')
    .sort({ name: 1 })
    .lean<CafeTarget[]>();

  if (cafes.length === 0) {
    throw new Error('대상 카페가 없습니다.');
  }

  if (targetCafeNames?.length) {
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

      return cafe;
    });
  }

  return cafes;
};

const joinAccountsToCafes = async (
  accounts: NormalizedAccount[],
  cafes: CafeTarget[],
): Promise<{ total: number; joined: number; alreadyMember: number; failed: number }> => {
  const summary = {
    total: accounts.length * cafes.length,
    joined: 0,
    alreadyMember: 0,
    failed: 0,
  };

  for (const [accountIndex, account] of accounts.entries()) {
    console.log(`[JOIN] 계정 ${accountIndex + 1}/${accounts.length}: ${account.accountId}`);
    const loginResult = await loginAccount(account.accountId, account.password, {
      waitForLoginMs: 60_000,
      pollIntervalMs: 1_000,
      reason: 'sync_accounts_join_cafes',
    });

    if (!loginResult.success) {
      summary.failed += cafes.length;
      console.log(`[JOIN] ${account.accountId}: 로그인 실패 - ${loginResult.error || '로그인 실패'}`);
      await closeContextForAccount(account.accountId).catch(() => {});
      continue;
    }

    for (const cafe of cafes) {
      console.log(`[JOIN] ${account.accountId} -> ${cafe.name} 시작`);
      const result = await joinCafeWithAccount(
        {
          id: account.accountId,
          password: account.password,
          nickname: account.nickname,
          role: account.role,
        },
        cafe.cafeId,
        { cafeUrl: cafe.cafeUrl },
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

      await sleep(3_000);
    }
  }

  return summary;
};

const main = async (): Promise<void> => {
  const payload = await parsePayload();
  const loginId = payload.loginId || DEFAULT_LOGIN_ID;
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI 환경변수가 필요합니다.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  const userId = await getUserId(loginId);
  const accounts = buildAccounts(payload);
  const syncSummary = await upsertAccounts(userId, accounts);
  const cafes = await loadTargetCafes(userId, payload.targetCafeNames);

  console.log(
    `[SYNC] 완료: 신규 ${syncSummary.created}, 업데이트 ${syncSummary.updated}, 대상 카페 ${cafes.length}개`,
  );

  const joinSummary = await joinAccountsToCafes(accounts, cafes);

  console.log(
    `[JOIN] 완료: 총 ${joinSummary.total}, 가입 ${joinSummary.joined}, 이미회원 ${joinSummary.alreadyMember}, 실패 ${joinSummary.failed}`,
  );

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[SYNC_JOIN] 실패:', error instanceof Error ? error.message : error);
    await closeAllContexts().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
