import type { ContentStyle, ViralPromptInput } from './prompts';
import {
  buildShortDailyPrompt,
  buildOwnKeywordPrompt,
  buildAnimePrompt,
} from './prompts';

export const CONTENT_STYLE: ContentStyle = '정보';

// Re-export everything from prompts
export * from './prompts';

export const buildViralPrompt = (
  input: ViralPromptInput,
  contentStyle: ContentStyle = CONTENT_STYLE
): string => {
  if (contentStyle === '애니') {
    return buildAnimePrompt(input);
  }
  if (contentStyle === '일상') {
    return buildShortDailyPrompt({ ...input, contentType: 'lifestyle' });
  }
  return buildOwnKeywordPrompt(input);
};
