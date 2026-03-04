import { isAccountLoggedIn } from '@/shared/lib/multi-session';

const ACCOUNT_ID = process.argv[2] || 'enugii';

const main = async () => {
  console.log(`[TEST] ${ACCOUNT_ID} 로그인 상태 확인...`);
  const loggedIn = await isAccountLoggedIn(ACCOUNT_ID);
  console.log(loggedIn ? '✅ 로그인 유지 중' : '❌ 로그인 안 됨');
  process.exit(0);
};

main().catch(console.error);
