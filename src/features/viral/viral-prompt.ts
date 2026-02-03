import type { ContentStyle, ViralPromptInput } from './prompts';
import {
  buildCasualPrompt,
  buildInfoPrompt,
  buildAnimePrompt,
} from './prompts';

export let CONTENT_STYLE: ContentStyle = '애니';

// Re-export everything from prompts
export * from './prompts';

export const buildViralPrompt = (input: ViralPromptInput): string => {
  if (CONTENT_STYLE === '애니') {
    return buildAnimePrompt(input);
  }
  if (CONTENT_STYLE === '일상') {
    return buildCasualPrompt(input);
  }
  return buildInfoPrompt(input);
};
