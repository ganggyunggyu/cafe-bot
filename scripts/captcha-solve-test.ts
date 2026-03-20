import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const CAPTCHA_DUMP_DIR = '/tmp/captcha-probe';

// 덤프에서 base64 이미지 추출
const extractBase64FromDump = (): { base64: string; question: string } => {
  const htmlPath = join(CAPTCHA_DUMP_DIR, 'attempt-1-full-html.html');
  const html = readFileSync(htmlPath, 'utf-8');

  // img#captchaimg의 base64 src 추출
  const imgMatch = html.match(/id="captchaimg"\s+src="data:image\/[^;]+;base64,([^"]+)"/);
  if (!imgMatch) throw new Error('captchaimg base64를 찾을 수 없음');

  // 질문 추출
  const questionMatch = html.match(/id="captcha_info"[^>]*>([^<]+)</);
  const question = questionMatch?.[1] || '구매한 물건은 총 몇 종류입니까?';

  return { base64: imgMatch[1], question };
};

// Gemini로 캡차 풀기
const solveWithGemini = async (base64: string, question: string, model: string) => {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 없음');

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const startedAt = Date.now();

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64,
            },
          },
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

  return { answer, elapsed, model };
};

// OpenAI로 캡차 풀기 (fetch 직접 호출)
const solveWithOpenAI = async (base64: string, question: string, model: string) => {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY 없음');

  const startedAt = Date.now();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: `이 이미지는 네이버 로그인 캡차로 나오는 가상 영수증 이미지야.
질문: "${question}"
숫자만 답해. 다른 말 하지마.`,
            },
          ],
        },
      ],
      max_tokens: 10,
    }),
  });

  const elapsed = Date.now() - startedAt;
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`OpenAI API 에러: ${JSON.stringify(data)}`);
  }

  const answer = data.choices?.[0]?.message?.content?.trim() || '';
  return { answer, elapsed, model };
};

const main = async () => {
  console.log('=== 캡차 AI 풀이 테스트 ===\n');

  const { base64, question } = extractBase64FromDump();
  console.log(`질문: ${question}`);
  console.log(`이미지 크기: ${Math.round(base64.length / 1024)}KB (base64)\n`);

  const results: { provider: string; model: string; answer: string; elapsed: number; error?: string }[] = [];

  // Gemini 테스트
  const geminiModels = ['gemini-3.1-flash-lite-preview'];
  for (const model of geminiModels) {
    try {
      console.log(`[Gemini] ${model} 테스트 중...`);
      const { answer, elapsed } = await solveWithGemini(base64, question, model);
      console.log(`  → 답: "${answer}" (${elapsed}ms)`);
      results.push({ provider: 'Gemini', model, answer, elapsed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  → 에러: ${msg}`);
      results.push({ provider: 'Gemini', model, answer: '', elapsed: 0, error: msg });
    }
  }

  // OpenAI 테스트
  const openaiModels = ['gpt-5.4-nano', 'gpt-5.4-mini'];
  for (const model of openaiModels) {
    try {
      console.log(`[OpenAI] ${model} 테스트 중...`);
      const { answer, elapsed } = await solveWithOpenAI(base64, question, model);
      console.log(`  → 답: "${answer}" (${elapsed}ms)`);
      results.push({ provider: 'OpenAI', model, answer, elapsed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  → 에러: ${msg}`);
      results.push({ provider: 'OpenAI', model, answer: '', elapsed: 0, error: msg });
    }
  }

  // 결과 요약
  console.log('\n=== 결과 요약 ===');
  console.log('Provider\t\tModel\t\t\t\tAnswer\tTime\tStatus');
  console.log('-'.repeat(90));
  for (const r of results) {
    const status = r.error ? `ERR: ${r.error.slice(0, 30)}` : 'OK';
    console.log(`${r.provider}\t\t${r.model.padEnd(24)}\t${r.answer || '-'}\t${r.elapsed}ms\t${status}`);
  }
};

main().catch(console.error);
