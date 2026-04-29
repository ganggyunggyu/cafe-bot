import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import { User } from '../src/shared/models/user';
import {
  closeAllContexts,
  invalidateLoginCache,
  loginAccount,
} from '../src/shared/lib/multi-session';

interface LoginRow {
  accountId: string;
  nickname: string;
  role: string;
  success: boolean;
  error: string;
}

const LOGIN_ID = '21lab';
const TARGET_ACCOUNT_IDS = process.argv.slice(2);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const main = async (): Promise<void> => {
  await mongoose.connect(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 10000,
  });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true })
    .select('userId')
    .lean<{ userId: string } | null>();

  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
    ...(TARGET_ACCOUNT_IDS.length > 0 && {
      accountId: { $in: TARGET_ACCOUNT_IDS },
    }),
  })
    .select('accountId password nickname role')
    .sort({ role: -1, accountId: 1 })
    .lean<
      Array<{
        accountId: string;
        password: string;
        nickname?: string;
        role?: string;
      }>
    >();

  console.log(`[LOGIN_CHECK] active accounts: ${accounts.length}`);

  const rows: LoginRow[] = [];

  for (const [index, account] of accounts.entries()) {
    const order = `${index + 1}/${accounts.length}`;
    console.log(
      `[LOGIN_CHECK] ${order} ${account.accountId} (${account.nickname || '-'}/${account.role || '-'}) fresh login start`
    );
    invalidateLoginCache(account.accountId);

    const result = await loginAccount(account.accountId, account.password, {
      forceFreshLogin: true,
      waitForLoginMs: 30000,
      pollIntervalMs: 1000,
      reason: 'active_account_login_audit_20260429',
    });

    const row: LoginRow = {
      accountId: account.accountId,
      nickname: account.nickname || account.accountId,
      role: account.role || '-',
      success: result.success,
      error: result.error || '',
    };

    rows.push(row);
    console.log(
      `[LOGIN_CHECK] ${account.accountId} ${result.success ? 'OK' : `FAIL ${result.error || ''}`}`
    );

    await sleep(3000);
  }

  const failedAccounts = rows.filter((row) => !row.success);

  console.log(
    `[LOGIN_CHECK_RESULT]${JSON.stringify(
      {
        total: rows.length,
        ok: rows.length - failedAccounts.length,
        failed: failedAccounts.length,
        failedAccounts,
        rows,
      },
      null,
      2
    )}`
  );

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(
      '[LOGIN_CHECK_ERROR]',
      error instanceof Error ? error.message : error
    );
    await closeAllContexts().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
