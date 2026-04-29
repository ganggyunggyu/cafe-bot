import mongoose from 'mongoose';
import { Account, User } from '@/shared/models';
import {
  closeAllContexts,
  getPageForAccount,
  invalidateLoginCache,
  loginAccount,
} from '@/shared/lib/multi-session';

const TARGET_ACCOUNT_IDS = [
  'regular14631',
  'nes1p2kx',
  'mh8j62wm',
  'angrykoala270',
  'tinyfish183',
];

const TARGET_CAFES = [
  { name: '샤넬오픈런', url: 'shoppingtpw' },
  { name: '쇼핑지름신', url: 'shopjirmsin' },
];

interface VerificationRow {
  accountId: string;
  nickname: string;
  cafe: string;
  status: 'MEMBER' | 'NOT_MEMBER' | 'LOGIN_FAILED' | 'MISSING_DB' | 'UNKNOWN';
  detail: string;
}

const getBodyText = async (page: Awaited<ReturnType<typeof getPageForAccount>>): Promise<string> => {
  return page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
};

const verifyCafeMembership = async (
  page: Awaited<ReturnType<typeof getPageForAccount>>,
  cafe: (typeof TARGET_CAFES)[number]
): Promise<Pick<VerificationRow, 'status' | 'detail'>> => {
  await page.goto(`https://m.cafe.naver.com/${cafe.url}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2500);

  const text = await getBodyText(page);
  const joinButtonCount = await page
    .locator(
      [
        'button:has-text("카페 가입하기")',
        'a:has-text("카페 가입하기")',
        'button:has-text("가입하기")',
        'a:has-text("가입하기")',
      ].join(', ')
    )
    .count()
    .catch(() => 0);
  const myActivityCount = await page.locator('text=나의활동').count().catch(() => 0);
  const writeButtonCount = await page
    .locator('a:has-text("글쓰기"), button:has-text("글쓰기"), a[href*="write"]')
    .count()
    .catch(() => 0);

  if (joinButtonCount > 0) {
    return { status: 'NOT_MEMBER', detail: '가입 버튼 보임' };
  }

  if (myActivityCount > 0 || writeButtonCount > 0 || text.includes('나의활동')) {
    return {
      status: 'MEMBER',
      detail: myActivityCount > 0 ? '나의활동 표시' : '회원 UI 확인',
    };
  }

  if (!text.includes('카페 가입하기')) {
    return { status: 'MEMBER', detail: '가입 버튼 없음' };
  }

  return { status: 'UNKNOWN', detail: '회원 신호 불명확' };
};

const main = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI 환경변수가 필요합니다.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: '21lab', isActive: true })
    .select('userId')
    .lean<{ userId: string } | null>();

  if (!user) {
    throw new Error('21lab 사용자를 찾을 수 없습니다.');
  }

  const accounts = await Account.find({
    userId: user.userId,
    accountId: { $in: TARGET_ACCOUNT_IDS },
  })
    .select('accountId password nickname')
    .lean<Array<{ accountId: string; password: string; nickname?: string }>>();
  const accountById = new Map(accounts.map((account) => [account.accountId, account]));
  const rows: VerificationRow[] = [];

  for (const accountId of TARGET_ACCOUNT_IDS) {
    const account = accountById.get(accountId);

    if (!account) {
      rows.push({
        accountId,
        nickname: '-',
        cafe: '-',
        status: 'MISSING_DB',
        detail: 'DB 계정 없음',
      });
      continue;
    }

    invalidateLoginCache(accountId);

    const loginResult = await loginAccount(accountId, account.password, {
      waitForLoginMs: 20000,
      reason: 'verify_membership',
      forceFreshLogin: true,
    });

    if (!loginResult.success) {
      for (const cafe of TARGET_CAFES) {
        rows.push({
          accountId,
          nickname: account.nickname || accountId,
          cafe: cafe.name,
          status: 'LOGIN_FAILED',
          detail: loginResult.error || '로그인 실패',
        });
      }

      continue;
    }

    const page = await getPageForAccount(accountId);

    for (const cafe of TARGET_CAFES) {
      const result = await verifyCafeMembership(page, cafe);

      rows.push({
        accountId,
        nickname: account.nickname || accountId,
        cafe: cafe.name,
        ...result,
      });
    }
  }

  console.log(JSON.stringify(rows, null, 2));

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[VERIFY] 실패: ${message}`);
    await closeAllContexts().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
