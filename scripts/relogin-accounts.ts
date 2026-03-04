import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import accountsJson from '@/shared/config/accounts.json';

const SESSION_DIR = join(process.cwd(), '.playwright-session');
if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });

const WRITER_IDS = ['compare14310', 'fail5644', 'loand3324', 'dyulp', 'gmezz'];

const accounts = (accountsJson as any[]).filter(a => WRITER_IDS.includes(a.accountId));

const main = async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });

  for (const acc of accounts) {
    const { accountId, password } = acc;
    console.log(`\n[LOGIN] ${accountId} 로그인 중...`);

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input#id', accountId);
    await page.fill('input#pw', password);
    await page.click('button.btn_login, button#log\\.login');
    await page.waitForTimeout(4000);

    const url = page.url();
    if (url.includes('nidlogin.login')) {
      console.log(`  ❌ ${accountId} 실패 (비번 확인 필요)`);
      await context.close();
      continue;
    }

    const cookies = await context.cookies();
    const cookiesFile = join(SESSION_DIR, `${accountId}-cookies.json`);
    writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
    console.log(`  ✅ ${accountId} 성공 → 쿠키 저장 (${cookies.length}개)`);

    await context.close();
    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();
  console.log('\n✅ 전체 재로그인 완료');
  process.exit(0);
};

main().catch(console.error);
