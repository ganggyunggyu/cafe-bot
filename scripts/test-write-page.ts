import { getPageForAccount, isAccountLoggedIn } from '@/shared/lib/multi-session';

const ACCOUNT_ID = process.argv[2] || 'enugii';
const CAFE_ID = '25460974';
const MENU_ID = '60';

const main = async () => {
  console.log(`[TEST] ${ACCOUNT_ID} 로그인 확인...`);
  const loggedIn = await isAccountLoggedIn(ACCOUNT_ID);
  if (!loggedIn) { console.log('❌ 로그인 안 됨'); process.exit(1); }
  console.log('✅ 로그인 확인');

  const page = await getPageForAccount(ACCOUNT_ID);
  const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/write?boardType=L&menuId=${MENU_ID}`;
  console.log(`\n[TEST] 글쓰기 페이지 이동: ${writeUrl}`);
  await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  const url = page.url();
  const isOnWritePage = url.includes('write') || url.includes('articles');
  const isRedirectedToLogin = url.includes('nidlogin');

  console.log(`현재 URL: ${url}`);
  if (isRedirectedToLogin) {
    console.log('❌ 로그인 페이지로 리다이렉트됨');
  } else if (isOnWritePage) {
    console.log('✅ 글쓰기 페이지 진입 성공');
  } else {
    console.log('⚠️ 예상치 못한 페이지');
  }

  await page.waitForTimeout(3000);
  process.exit(0);
};

main().catch(console.error);
