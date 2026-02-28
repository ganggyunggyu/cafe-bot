/**
 * 키워드 단건 테스트
 * Usage:
 *   KEYWORD=야근 TYPE=daily npx tsx --env-file=.env.local scripts/test-keyword.ts
 *   KEYWORD=시아버지생신선물 TYPE=ad npx tsx --env-file=.env.local scripts/test-keyword.ts
 */
import { buildShortDailyPrompt } from '../src/features/viral/prompts/build-short-daily-prompt';
import { buildInfoPrompt } from '../src/features/viral/prompts/build-info-prompt';
import { buildOwnKeywordPrompt } from '../src/features/viral/prompts/build-own-keyword-prompt';
import { generateViralContent } from '../src/shared/api/content-api';

const KEYWORD = process.env.KEYWORD || '야근';
const TYPE = process.env.TYPE || 'daily';

const main = async () => {
  const prompt =
    TYPE === 'own'
      ? buildOwnKeywordPrompt({ keyword: KEYWORD, keywordType: 'own' })
      : TYPE === 'ad'
        ? buildInfoPrompt({ keyword: KEYWORD, keywordType: 'own' })
        : buildShortDailyPrompt({ keyword: KEYWORD, keywordType: 'own' });

  const label = TYPE === 'own' ? '자사키워드광고' : TYPE === 'ad' ? '광고' : '일상';
  console.log(`=== ${label} | "${KEYWORD}" ===\n`);
  const { content } = await generateViralContent({ prompt });
  console.log(content);
};

main().catch(console.error);
