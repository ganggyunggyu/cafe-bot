import { GoogleGenAI } from '@google/genai';

export interface GenerateCafeCommentInput {
  articleTitle?: string;
  articleContent: string;
  authorName?: string;
  personaHint?: string;
  model?: string;
}

const getGeminiApiKey = (): string => {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  return apiKey;
};

const normalizeText = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim();
};

export const generateCafeCommentWithGemini = async (
  input: GenerateCafeCommentInput
): Promise<string> => {
  const { articleTitle, articleContent, authorName, personaHint, model } = input;

  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  const safeTitle = normalizeText(articleTitle ?? '');
  const safeBody = normalizeText(articleContent);
  const safeAuthor = normalizeText(authorName ?? '');
  const safePersona = normalizeText(personaHint ?? '');

  const trimmedBody = safeBody.slice(0, 2500);

  const prompt = normalizeText(`
너는 네이버 카페에서 자연스럽게 댓글을 다는 일반 회원임.
광고/홍보 티 절대 내지 말고, 링크/연락처/가격/구매유도 금지임.
이모지/특수문자 남발 금지, 1~2문장, 40~120자 정도로 짧게 작성.
글 내용에서 구체적인 포인트 1개를 꼭 집어서 공감/질문/칭찬 중 하나로 반응.

${safePersona ? `말투 힌트: ${safePersona}` : ''}

작성자: ${safeAuthor || '알 수 없음'}
제목: ${safeTitle || '알 수 없음'}
본문(발췌): ${trimmedBody}

출력은 댓글 문장만 한 줄로.`);

  const response = await ai.models.generateContent({
    model: model ?? 'gemini-3.1-pro-preview',
    contents: prompt,
  });

  const text = normalizeText(response.text ?? '');
  if (!text) {
    throw new Error('Gemini returned empty text');
  }

  return text;
};
