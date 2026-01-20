// ★★★ 콘텐츠 스타일 토글 (최상단) ★★★
// '정보' = 정보성 콘텐츠 (건강, 제품 추천 중심)
// '일상' = 일상 콘텐츠 (개인 경험, 라이프스타일 중심)
import type { ContentStyle, ViralPromptInput } from './prompts';
import { buildCasualPrompt, buildInfoPrompt } from './prompts';

export let CONTENT_STYLE: ContentStyle = '정보';

// Re-export everything from prompts
export * from './prompts';

export const buildViralPrompt = (input: ViralPromptInput): string => {
  if (CONTENT_STYLE === '일상') {
    return buildCasualPrompt(input);
  }
  return buildInfoPrompt(input);
};
