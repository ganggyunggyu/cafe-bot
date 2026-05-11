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

const COMMENT_PATTERN_GUIDES = [
  '본문 디테일을 짚고 짧게 질문하는 댓글',
  '비슷한 경험을 한 문장으로만 공유하는 댓글',
  '조심스럽게 확인하거나 되묻는 댓글',
  '가벼운 공감 뒤에 다른 표현으로 마무리하는 댓글',
  '생활 팁을 살짝 얹되 권유하지 않는 댓글',
];

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
  const patternGuide = COMMENT_PATTERN_GUIDES[Math.floor(Math.random() * COMMENT_PATTERN_GUIDES.length)];

  const prompt = normalizeText(`
너는 네이버 카페에서 자연스럽게 댓글을 다는 일반 회원입니다.
광고/홍보 티 절대 내지 말고, 링크/연락처/가격/구매유도 금지입니다.
이모지/특수문자 남발 금지, 1~2문장, 40~120자 정도로 짧게 작성합니다.
글 내용에서 구체적인 포인트 1개를 꼭 집어서 공감/질문/칭찬 중 하나로 반응.
이번 댓글 패턴: ${patternGuide}

말투 규칙:
- 반드시 존댓말로 끝냅니다. "~요", "~어요", "~네요", "~거든요", "~더라고요" 중심.
- "~했어", "~같아", "~좋아", "~맞아", "~문제야", "~하자", "~해봐" 같은 반말 종결 금지.
- "맞아요", "저도", "오", "헐"로 시작하는 흔한 패턴은 피하고 본문 디테일로 시작.
- "좋아 보이네요", "괜찮아 보이네요" 대신 "좋아 보여요", "괜찮아 보여요" 사용.

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
