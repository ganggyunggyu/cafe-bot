import { loginAccount, isAccountLoggedIn, invalidateLoginCache } from '@/shared/lib/multi-session';

const accounts = [
  { id: 'compare14310', password: '' },
  { id: 'fail5644',     password: '' },
  { id: 'loand3324',    password: '' },
  { id: 'dyulp',        password: '' },
  { id: 'gmezz',        password: '' },
];

// accounts.json 에서 비번 로드
import accountsJson from '@/shared/config/accounts.json';

const main = async () => {
  for (const acc of accountsJson) {
    if (!['compare14310','fail5644','loand3324','dyulp','gmezz'].includes(acc.accountId)) continue;

    invalidateLoginCache(acc.accountId);
    console.log(`[TEST] ${acc.accountId} 로그인 시도...`);
    const result = await loginAccount(acc.accountId, acc.password);
    if (result.success) {
      console.log(`  ✅ 성공`);
    } else {
      console.log(`  ❌ 실패: ${result.error}`);
    }
  }

  process.exit(0);
};

main().catch(console.error);
