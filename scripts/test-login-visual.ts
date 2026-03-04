import { chromium } from 'playwright';

const ACCOUNT_ID = process.argv[2] || 'enugii';
const PASSWORD = process.argv[3] || 'sadito0229!';

const main = async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.fill('input#id', ACCOUNT_ID);
  await page.fill('input#pw', PASSWORD);
  await page.click('button.btn_login, button#log\\.login');

  await page.waitForTimeout(5000);

  const url = page.url();
  console.log('현재 URL:', url);
  console.log(url.includes('nidlogin') ? '❌ 로그인 실패' : '✅ 로그인 성공');

  // 5초 더 대기 (화면 확인용)
  await page.waitForTimeout(5000);
  await browser.close();
  process.exit(0);
};

main().catch(console.error);
