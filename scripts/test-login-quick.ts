import { chromium } from 'playwright';
import { Account } from '@/shared/models/account';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI!;
const TEST_ACCOUNT = process.argv[2] || 'olgdmp9921';

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const acc = await Account.findOne({ accountId: TEST_ACCOUNT, isActive: true }).lean();
  if (!acc) { console.log('계정 없음'); process.exit(1); }

  console.log(`[TEST] ${TEST_ACCOUNT} 로그인 시도 (브라우저 열림)...`);
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
  await page.fill('input#id', TEST_ACCOUNT);
  await page.fill('input#pw', acc.password);
  await page.click('button.btn_login, button#log\\.login');

  console.log('[INFO] 로그인 버튼 클릭 완료. 브라우저 확인해봐냥.');
  console.log('[INFO] 캡챠/2차인증 직접 확인 후, 터미널에서 Ctrl+C로 종료.');

  await new Promise(() => {});
};

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
