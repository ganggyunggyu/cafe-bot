import { chromium, Page } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const DUMP_DIR = '/tmp/captcha-probe';
if (!existsSync(DUMP_DIR)) mkdirSync(DUMP_DIR, { recursive: true });

const TEST_ID = 'ggg8019';
const TEST_PW = '12Qwaszx!@';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const dumpPageState = async (page: Page, attempt: number, label: string) => {
  const prefix = join(DUMP_DIR, `attempt-${attempt}-${label}`);

  const url = page.url();
  const bodyHtml = await page.evaluate(() => document.body?.innerHTML || '').catch(() => '');
  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

  // 모든 input 요소 수집
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(el => ({
      name: el.name,
      id: el.id,
      type: el.type,
      placeholder: el.placeholder,
      className: el.className,
      visible: el.offsetParent !== null,
      value: el.value,
    }))
  ).catch(() => []);

  // 모든 iframe 수집
  const iframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).map(el => ({
      src: el.src,
      id: el.id,
      name: el.name,
      className: el.className,
    }))
  ).catch(() => []);

  // 주요 감지 패턴 체크
  const patterns = {
    chk_captcha: bodyHtml.includes('chk_captcha'),
    자동등록방지: bodyText.includes('자동등록방지'),
    보안문자입력: bodyText.includes('보안문자 입력'),
    captcha_in_html: bodyHtml.includes('captcha'),
    recaptcha: bodyHtml.includes('recaptcha'),
    grecaptcha: bodyHtml.includes('g-recaptcha'),
    hcaptcha: bodyHtml.includes('hcaptcha'),
    challenge: bodyHtml.includes('challenge'),
    nidlogin_in_url: url.includes('nidlogin'),
    nid_naver_in_url: url.includes('nid.naver.com'),
    잘못되었습니다: bodyText.includes('잘못 되었습니다'),
    비밀번호확인: bodyText.includes('비밀번호를 정확히'),
    새로운환경: bodyText.includes('새로운 환경'),
    기기인증: bodyText.includes('기기') && bodyText.includes('인증'),
    문자인증: bodyText.includes('문자') && bodyText.includes('인증'),
    보안강화: bodyText.includes('보안') && bodyText.includes('강화'),
  };

  const dump = {
    timestamp: new Date().toISOString(),
    attempt,
    label,
    url,
    patterns,
    inputs,
    iframes,
    bodyTextSnippet: bodyText.slice(0, 2000),
  };

  writeFileSync(`${prefix}-dump.json`, JSON.stringify(dump, null, 2));
  await page.screenshot({ path: `${prefix}-screenshot.png`, fullPage: true });

  console.log(`  [DUMP] ${prefix}`);
  console.log(`  URL: ${url}`);
  console.log(`  패턴 매칭:`, Object.entries(patterns).filter(([, v]) => v).map(([k]) => k).join(', ') || '없음');
  console.log(`  input 수: ${inputs.length}, iframe 수: ${iframes.length}`);

  return { url, patterns, inputs, iframes };
};

const classifyState = (patterns: Record<string, boolean>, url: string) => {
  if (!url.includes('nid.naver.com') && !url.includes('nidlogin')) return 'LOGIN_SUCCESS';
  if (patterns.chk_captcha || patterns.자동등록방지 || patterns.보안문자입력) return 'CAPTCHA_DETECTED';
  if (patterns.captcha_in_html || patterns.recaptcha || patterns.grecaptcha || patterns.hcaptcha) return 'CAPTCHA_VARIANT';
  if (patterns.잘못되었습니다 || patterns.비밀번호확인) return 'WRONG_PASSWORD';
  if (patterns.새로운환경 || patterns.기기인증 || patterns.문자인증) return 'DEVICE_AUTH';
  if (patterns.보안강화) return 'SECURITY_ENHANCED';
  if (patterns.nidlogin_in_url) return 'STILL_ON_LOGIN';
  return 'UNKNOWN';
};

const main = async () => {
  console.log('=== 캡차 탐지 스크립트 시작 ===');
  console.log(`계정: ${TEST_ID}`);
  console.log(`덤프 경로: ${DUMP_DIR}\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let attempt = 0;

  try {
    while (true) {
      attempt++;
      console.log(`\n--- 시도 #${attempt} ---`);

      // 1. 로그인 페이지 이동
      await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);

      // 로그인 페이지 상태 확인 (이미 로그인 되어있으면 로그아웃)
      if (!page.url().includes('nidlogin')) {
        console.log('  이미 로그인됨 → 로그아웃 시도');
        await page.goto('https://nid.naver.com/nidlogin.logout', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        await sleep(1000);
        await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(500);
      }

      // 2. ID/PW 입력
      await page.fill('input#id', TEST_ID);
      await sleep(200);
      await page.fill('input#pw', TEST_PW);
      await sleep(200);

      // 3. 로그인 버튼 클릭
      await page.click('button.btn_login, button#log\\.login');
      await sleep(3000);

      // 4. 상태 덤프
      const { url, patterns } = await dumpPageState(page, attempt, 'after-login');
      const state = classifyState(patterns, url);
      console.log(`  ▶ 상태: ${state}`);

      if (state === 'CAPTCHA_DETECTED' || state === 'CAPTCHA_VARIANT') {
        console.log('\n🚨 캡차 감지됨! 상세 분석 시작...');

        // 추가 덤프: 전체 HTML
        const fullHtml = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '');
        writeFileSync(join(DUMP_DIR, `attempt-${attempt}-full-html.html`), fullHtml);

        // iframe 내부 분석
        const frames = page.frames();
        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i];
          const frameUrl = frame.url();
          if (!frameUrl || frameUrl === 'about:blank') continue;

          const frameHtml = await frame.evaluate(() => document.body?.innerHTML || '').catch(() => '');
          const frameText = await frame.evaluate(() => document.body?.innerText || '').catch(() => '');
          writeFileSync(join(DUMP_DIR, `attempt-${attempt}-frame-${i}.json`), JSON.stringify({
            frameUrl,
            frameHtml: frameHtml.slice(0, 5000),
            frameText: frameText.slice(0, 2000),
          }, null, 2));
          console.log(`  iframe[${i}]: ${frameUrl}`);
        }

        console.log(`\n✅ 캡차 상태 덤프 완료: ${DUMP_DIR}`);
        console.log('브라우저를 열어둘게냥. 직접 확인 후 Ctrl+C로 종료해냥.');

        // 브라우저 열어둔 채로 대기
        await new Promise(() => {});
      }

      if (state === 'DEVICE_AUTH' || state === 'SECURITY_ENHANCED') {
        console.log(`\n⚠️ ${state} 감지! 덤프 저장 완료.`);
        const fullHtml = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '');
        writeFileSync(join(DUMP_DIR, `attempt-${attempt}-full-html.html`), fullHtml);
        console.log('브라우저를 열어둘게냥. 직접 확인 후 Ctrl+C로 종료해냥.');
        await new Promise(() => {});
      }

      if (state === 'WRONG_PASSWORD') {
        console.log('  ❌ 비밀번호 틀림 — 스크립트 종료');
        break;
      }

      if (state === 'LOGIN_SUCCESS') {
        console.log('  ✅ 로그인 성공 → 로그아웃');
        // 쿠키 클리어하고 로그아웃
        await page.goto('https://nid.naver.com/nidlogin.logout', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        await context.clearCookies();
        await sleep(2000);
      }

      if (state === 'STILL_ON_LOGIN' || state === 'UNKNOWN') {
        console.log('  ⚠️ 로그인 안됨 — 추가 대기 후 재시도');
        const { patterns: p2 } = await dumpPageState(page, attempt, 'extra-wait');
        const state2 = classifyState(p2, page.url());
        console.log(`  ▶ 재확인 상태: ${state2}`);

        if (state2 === 'CAPTCHA_DETECTED' || state2 === 'CAPTCHA_VARIANT') {
          console.log('\n🚨 캡차 감지됨!');
          const fullHtml = await page.evaluate(() => document.documentElement.outerHTML).catch(() => '');
          writeFileSync(join(DUMP_DIR, `attempt-${attempt}-full-html.html`), fullHtml);
          console.log(`덤프: ${DUMP_DIR}`);
          await new Promise(() => {});
        }
      }

      // 다음 시도 전 짧은 대기
      console.log('  ⏳ 2초 대기 후 다음 시도...');
      await sleep(2000);
    }
  } catch (err) {
    console.error('스크립트 오류:', err);
    await dumpPageState(page, attempt, 'error');
  } finally {
    await browser.close();
  }
};

main().catch(console.error);
