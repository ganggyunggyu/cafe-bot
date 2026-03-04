import { chromium, Browser, Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import accountsJson from '@/shared/config/accounts.json';

const SESSION_DIR = join(process.cwd(), '.playwright-session');
const SCREENSHOT_DIR = '/tmp/login-screenshots';
const ANSWER_FILE = '/tmp/captcha-answer.txt';

if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const waitForAnswer = async (screenshotPath: string, accountId: string): Promise<string> => {
  // 답 파일 초기화
  if (existsSync(ANSWER_FILE)) rmSync(ANSWER_FILE);

  console.log(`\n📸 [${accountId}] 스크린샷: ${screenshotPath}`);
  console.log(`🤖 Claude가 이미지 읽는 중... 답 입력 대기 (무제한)`);
  console.log(`   → Claude가 답 쓰면: echo "답" > ${ANSWER_FILE}`);

  // 무한 대기 (1초마다 확인)
  while (true) {
    await sleep(1000);
    if (existsSync(ANSWER_FILE)) {
      const answer = readFileSync(ANSWER_FILE, 'utf-8').trim();
      if (answer) {
        console.log(`   ✅ 답 수신: "${answer}"`);
        rmSync(ANSWER_FILE);
        return answer;
      }
    }
  }
};

const detectPageState = async (page: Page): Promise<'success' | 'captcha' | 'otp' | 'failed' | 'unknown'> => {
  const url = page.url();

  if (!url.includes('nid.naver.com')) return 'success';
  if (!url.includes('nidlogin')) return 'success';

  // 페이지 내용 분석
  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  const bodyHtml = await page.evaluate(() => document.body?.innerHTML || '').catch(() => '');

  // 비번 오류 먼저 체크 (캡챠보다 우선)
  if (bodyText.includes('잘못 되었습니다') || bodyText.includes('아이디와 비밀번호를 정확히')) {
    return 'failed';
  }
  if (bodyHtml.includes('chk_captcha') || bodyText.includes('자동등록방지') || bodyText.includes('보안문자 입력')) {
    return 'captcha';
  }
  if (bodyText.includes('문자') && bodyText.includes('인증') || bodyHtml.includes('otp') || bodyHtml.includes('sms')) {
    return 'otp';
  }
  if (url.includes('nidlogin.login')) {
    return 'failed';
  }
  return 'unknown';
};

const loginSingleAccount = async (
  browser: Browser,
  accountId: string,
  password: string
): Promise<'success' | 'failed' | 'skip'> => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input#id', accountId);
    await sleep(300);
    await page.fill('input#pw', password);
    await sleep(300);
    await page.click('button.btn_login, button#log\\.login');
    await sleep(4000);

    let state = await detectPageState(page);
    console.log(`   상태: ${state}`);

    // 캡챠 처리 루프
    let attempts = 0;
    while ((state === 'captcha' || state === 'unknown') && attempts < 3) {
      attempts++;
      const screenshotPath = join(SCREENSHOT_DIR, `${accountId}-attempt${attempts}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const answer = await waitForAnswer(screenshotPath, accountId);
      if (!answer) {
        console.log(`   ⏰ 타임아웃 — 다음 계정으로`);
        break;
      }

      // 캡챠 입력 시도 (visible한 것만)
      const captchaVisible = await page.isVisible('input[name="chk_captcha"], input[id*="captcha"], input[placeholder*="보안문자"]').catch(() => false);
      if (captchaVisible) {
        await page.fill('input[name="chk_captcha"], input[id*="captcha"], input[placeholder*="보안문자"]', answer, { timeout: 5000 });
        await sleep(300);
        await page.click('button.btn_login, button[type="submit"]');
        await sleep(3000);
        state = await detectPageState(page);
        console.log(`   캡챠 입력 후 상태: ${state}`);
      } else {
        console.log(`   캡챠 입력창 없음 — 비번 오류로 판단`);
        break;
      }
    }

    if (state === 'otp') {
      const screenshotPath = join(SCREENSHOT_DIR, `${accountId}-otp.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`   ⚠️  OTP/SMS 인증 필요 — 스크린샷: ${screenshotPath}`);
      await context.close();
      return 'failed';
    }

    if (state === 'success') {
      const cookies = await context.cookies();
      const cookiesFile = join(SESSION_DIR, `${accountId}-cookies.json`);
      writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
      console.log(`   ✅ 성공 — 쿠키 저장 (${cookies.length}개)`);
      await context.close();
      return 'success';
    }

    console.log(`   ❌ 실패`);
    await context.close();
    return 'failed';

  } catch (e) {
    console.log(`   💥 오류: ${e}`);
    await context.close();
    return 'failed';
  }
};

const main = async () => {
  const SKIP_DONE = ['cookie4931','wound12567','precede1451','dyulp','lesyt','aryunt','loand3324'];
  const accounts = (accountsJson as { accountId: string; password: string }[]).filter(a => !SKIP_DONE.includes(a.accountId));

  console.log(`총 ${accounts.length}개 계정 로그인 시작\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 100 });

  const results = { success: 0, failed: 0, skip: 0 };
  const failedAccounts: string[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const { accountId, password } = accounts[i];
    console.log(`\n[${i + 1}/${accounts.length}] ${accountId}`);

    const result = await loginSingleAccount(browser, accountId, password);
    results[result]++;
    if (result === 'failed') failedAccounts.push(accountId);

    await sleep(30000); // 계정 간 30초 간격
  }

  await browser.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 성공: ${results.success}개`);
  console.log(`❌ 실패: ${results.failed}개`);
  if (failedAccounts.length > 0) {
    console.log(`실패 계정: ${failedAccounts.join(', ')}`);
  }
  process.exit(0);
};

main().catch(console.error);
