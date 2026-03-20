import { Page } from 'playwright';
import { GoogleGenAI } from '@google/genai';

const CAPTCHA_MODEL = 'gemini-3.1-flash-lite-preview';
const MAX_CAPTCHA_ATTEMPTS = 3;
const CAPTCHA_INPUT_DELAY_MS = 200;
const PW_INPUT_DELAY_MS = 150;
const LOGIN_CLICK_WAIT_MS = 3000;

const SELECTORS = {
  captchaType: '#captcha_type',
  captchaImg: '#captchaimg',
  captchaInfo: '#captcha_info',
  captchaInput: 'input#captcha',
  pwInput: 'input#pw',
  loginButton: 'button.btn_login, button#log\\.login',
} as const;

const getGeminiApiKey = (): string | null => {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    null
  );
};

let geminiClient: GoogleGenAI | null = null;

const getGeminiClient = (): GoogleGenAI => {
  if (geminiClient) return geminiClient;

  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY 없음');

  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
};

type CaptchaDetectResult = {
  detected: boolean;
  base64?: string;
  question?: string;
  captchaType?: string;
};

const safeEvaluate = async <T>(page: Page, fn: () => T, fallback: T): Promise<T> => {
  return page.evaluate(fn).catch(() => fallback);
};

export const detectCaptcha = async (page: Page): Promise<CaptchaDetectResult> => {
  const captchaType = await safeEvaluate(page, () => {
    const el = document.getElementById('captcha_type') as HTMLInputElement | null;
    return el?.value || '';
  }, '');

  if (!captchaType) return { detected: false };

  const base64 = await safeEvaluate(page, () => {
    const img = document.getElementById('captchaimg') as HTMLImageElement | null;
    if (!img?.src) return '';
    const match = img.src.match(/base64,(.+)/);
    return match?.[1] || '';
  }, '');

  if (!base64) return { detected: false };

  const question = await safeEvaluate(page, () => {
    const el = document.getElementById('captcha_info');
    return el?.textContent?.trim() || '';
  }, '');

  return { detected: true, base64, question, captchaType };
};

const solveWithGemini = async (
  base64: string,
  question: string
): Promise<{ answer: string; elapsed: number }> => {
  const ai = getGeminiClient();
  const startedAt = Date.now();

  const response = await ai.models.generateContent({
    model: CAPTCHA_MODEL,
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

export const solveCaptchaOnPage = async (
  page: Page,
  accountId: string,
  password?: string
): Promise<{ solved: boolean; attempts: number; error?: string }> => {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
    const captcha = await detectCaptcha(page);

    if (!captcha.detected) {
      return { solved: true, attempts: attempt - 1 };
    }

    console.log(
      `[CAPTCHA] ${accountId} 캡차 감지 (시도 ${attempt}/${MAX_CAPTCHA_ATTEMPTS}) — 타입: ${captcha.captchaType}, 질문: ${captcha.question}`
    );

    try {
      const { answer, elapsed } = await solveWithGemini(captcha.base64!, captcha.question!);

      if (!answer) {
        console.warn(`[CAPTCHA] ${accountId} AI가 빈 답변 반환 — 재시도`);
        continue;
      }

      console.log(`[CAPTCHA] ${accountId} AI 답: "${answer}" (${elapsed}ms)`);

      await page.fill(SELECTORS.captchaInput, answer);
      await page.waitForTimeout(CAPTCHA_INPUT_DELAY_MS);

      const pwEmpty = await safeEvaluate(page, () =>
        (document.getElementById('pw') as HTMLInputElement)?.value === '', false);

      if (pwEmpty && password) {
        await page.fill(SELECTORS.pwInput, password);
        await page.waitForTimeout(PW_INPUT_DELAY_MS);
      }

      await page.click(SELECTORS.loginButton);
      await page.waitForTimeout(LOGIN_CLICK_WAIT_MS);

      if (!page.url().includes('nidlogin')) {
        console.log(`[CAPTCHA] ${accountId} 캡차 풀이 성공 (${attempt}회 시도)`);
        return { solved: true, attempts: attempt };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CAPTCHA] ${accountId} 풀이 에러 (시도 ${attempt}): ${msg}`);
      continue;
    }
  }

  console.log(`[CAPTCHA] ${accountId} ${MAX_CAPTCHA_ATTEMPTS}회 시도 실패`);
  return { solved: false, attempts: MAX_CAPTCHA_ATTEMPTS, error: '캡차 풀이 최대 시도 초과' };
};
