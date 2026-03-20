import { chromium, Page } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const DUMP_DIR = '/tmp/captcha-accuracy';
if (!existsSync(DUMP_DIR)) mkdirSync(DUMP_DIR, { recursive: true });

const TEST_ID = 'ggg8019';
const TEST_PW = '12Qwaszx!@';
const TOTAL_ROUNDS = 30;
const MODEL = 'gemini-3.1-flash-lite-preview';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 없음');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type RoundResult = {
  round: number;
  question: string;
  aiAnswer: string;
  correct: boolean;
  elapsed: number;
  error?: string;
};

const solveWithGemini = async (base64: string, question: string): Promise<{ answer: string; elapsed: number }> => {
  const startedAt = Date.now();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
          {
            text: `이 이미지는 네이버 로그인 캡차로 나오는 가상 영수증 이미지야.
질문: "${question}"
숫자만 답해. 다른 말 하지마.`,
          },
        ],
      },
    ],
  });

  const elapsed = Date.now() - startedAt;
  const answer = response.text?.trim() || '';
  return { answer, elapsed };
};

const extractCaptchaFromPage = async (page: Page): Promise<{ base64: string; question: string } | null> => {
  // captcha_type 확인
  const captchaType = await page.evaluate(() => {
    const el = document.getElementById('captcha_type') as HTMLInputElement | null;
    return el?.value || '';
  }).catch(() => '');

  if (!captchaType) return null;

  // base64 이미지 추출
  const base64 = await page.evaluate(() => {
    const img = document.getElementById('captchaimg') as HTMLImageElement | null;
    if (!img?.src) return '';
    const match = img.src.match(/base64,(.+)/);
    return match?.[1] || '';
  }).catch(() => '');

  if (!base64) return null;

  // 질문 추출
  const question = await page.evaluate(() => {
    const el = document.getElementById('captcha_info');
    return el?.textContent?.trim() || '';
  }).catch(() => '');

  return { base64, question };
};

const main = async () => {
  console.log(`=== 캡차 정확도 테스트 (${TOTAL_ROUNDS}회) ===`);
  console.log(`모델: ${MODEL}\n`);

  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const results: RoundResult[] = [];
  let consecutiveErrors = 0;

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    console.log(`\n--- [${round}/${TOTAL_ROUNDS}] ---`);

    try {
      // 1. 로그인 페이지 이동
      await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);

      // 이미 로그인되어 있으면 로그아웃
      if (!page.url().includes('nidlogin')) {
        await page.goto('https://nid.naver.com/nidlogin.logout', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        await context.clearCookies();
        await sleep(1000);
        await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
        await sleep(500);
      }

      // 2. ID/PW 입력 → 로그인 시도 (캡차 유발)
      await page.fill('input#id', TEST_ID);
      await sleep(150);
      await page.fill('input#pw', TEST_PW);
      await sleep(150);
      await page.click('button.btn_login, button#log\\.login');
      await sleep(3000);

      // 3. 캡차 추출
      const captcha = await extractCaptchaFromPage(page);
      if (!captcha) {
        // 캡차 없이 로그인 성공 또는 다른 상태
        const url = page.url();
        if (!url.includes('nidlogin')) {
          console.log('  캡차 없이 로그인 성공 → 로그아웃 후 재시도');
          await page.goto('https://nid.naver.com/nidlogin.logout', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
          await context.clearCookies();
          await sleep(2000);
          round--; // 이 라운드 다시
          continue;
        }
        console.log('  캡차 감지 실패 — 스킵');
        results.push({ round, question: '', aiAnswer: '', correct: false, elapsed: 0, error: 'captcha not detected' });
        continue;
      }

      console.log(`  질문: ${captcha.question}`);

      // 4. Gemini로 풀기
      const { answer, elapsed } = await solveWithGemini(captcha.base64, captcha.question);
      console.log(`  AI 답: "${answer}" (${elapsed}ms)`);

      // 5. 답 입력 후 제출
      await page.fill('input#captcha', answer);
      await sleep(200);

      // 비밀번호 다시 입력 (캡차 페이지에서 비워질 수 있음)
      const pwValue = await page.evaluate(() => (document.getElementById('pw') as HTMLInputElement)?.value || '').catch(() => '');
      if (!pwValue) {
        await page.fill('input#pw', TEST_PW);
        await sleep(150);
      }

      await page.click('button.btn_login, button#log\\.login');
      await sleep(3000);

      // 6. 결과 확인
      const afterUrl = page.url();
      const isSuccess = !afterUrl.includes('nidlogin');

      // 캡차가 다시 나왔는지 확인 (= 오답)
      const captchaAgain = await extractCaptchaFromPage(page);
      const correct = isSuccess || !captchaAgain;

      const symbol = correct ? '✅' : '❌';
      console.log(`  결과: ${symbol} ${correct ? '정답' : '오답'} (${elapsed}ms)`);

      // 스크린샷 저장 (오답일 때)
      if (!correct) {
        await page.screenshot({ path: join(DUMP_DIR, `round-${round}-wrong.png`), fullPage: true });
      }

      results.push({ round, question: captcha.question, aiAnswer: answer, correct, elapsed });
      consecutiveErrors = 0;

      // 성공했으면 로그아웃
      if (isSuccess) {
        await page.goto('https://nid.naver.com/nidlogin.logout', { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
        await context.clearCookies();
        await sleep(1000);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  에러: ${msg}`);
      results.push({ round, question: '', aiAnswer: '', correct: false, elapsed: 0, error: msg });
      consecutiveErrors++;

      if (consecutiveErrors >= 5) {
        console.log('\n연속 5회 에러 — 중단');
        break;
      }
    }

    // 라운드 간 딜레이
    await sleep(1500);
  }

  await browser.close();

  // === 결과 요약 ===
  const valid = results.filter(r => !r.error);
  const correct = valid.filter(r => r.correct);
  const wrong = valid.filter(r => !r.correct);
  const avgElapsed = valid.length > 0 ? Math.round(valid.reduce((sum, r) => sum + r.elapsed, 0) / valid.length) : 0;

  // 토큰 비용 추정 (이미지 ~258토큰 + 텍스트 ~60토큰 = ~320 input, ~2 output)
  const estimatedCostPerCall = (320 * 0.25 + 2 * 1.50) / 1_000_000;
  const totalCost = estimatedCostPerCall * valid.length;

  console.log('\n' + '='.repeat(60));
  console.log('=== 최종 결과 ===');
  console.log(`모델: ${MODEL}`);
  console.log(`총 시도: ${results.length}회`);
  console.log(`유효 시도: ${valid.length}회 (에러 ${results.length - valid.length}회)`);
  console.log(`정답: ${correct.length}회`);
  console.log(`오답: ${wrong.length}회`);
  console.log(`정확도: ${valid.length > 0 ? Math.round((correct.length / valid.length) * 100) : 0}%`);
  console.log(`평균 응답: ${avgElapsed}ms`);
  console.log(`추정 비용: $${totalCost.toFixed(6)} (전체), $${estimatedCostPerCall.toFixed(6)} (건당)`);
  console.log('='.repeat(60));

  // 오답 상세
  if (wrong.length > 0) {
    console.log('\n--- 오답 상세 ---');
    for (const r of wrong) {
      console.log(`  [${r.round}] 질문: "${r.question}" → AI답: "${r.aiAnswer}"`);
    }
  }

  // JSON 저장
  writeFileSync(join(DUMP_DIR, 'results.json'), JSON.stringify({ model: MODEL, results, summary: {
    total: results.length,
    valid: valid.length,
    correct: correct.length,
    wrong: wrong.length,
    accuracy: valid.length > 0 ? Math.round((correct.length / valid.length) * 100) : 0,
    avgElapsedMs: avgElapsed,
    estimatedCostPerCall,
    totalCost,
  }}, null, 2));

  console.log(`\n상세 결과 저장: ${DUMP_DIR}/results.json`);
};

main().catch(console.error);
