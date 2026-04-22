/**
 * 타사옹호(competitor-advocacy) 프롬프트로 제목이 어떻게 뽑히는지 테스트
 * Usage: npx tsx --env-file=.env.local scripts/test-advocacy-titles.ts
 */
import { buildCompetitorAdvocacyPrompt } from '../src/features/viral/prompts/build-competitor-advocacy-prompt';
import { generateViralContent } from '../src/shared/api/content-api';
import { parseViralResponse } from '../src/features/viral/viral-parser';

const TEST_KEYWORDS = [
  '기력보충 음식',
  '엄마 칠순 선물',
  '어머님 생신선물',
  '산모 음식',
  '60대 어머니 선물',
  '아빠 생신선물',
  '아이소이 블레미쉬 케어 세럼',
  '비타민D 영양제',
  '갱년기 영양제',
  '루테인',
  '프로폴리스',
  '오메가3',
  '임산부 비타민',
  '관절 영양제',
];

const main = async () => {
  console.log(`\n=== 타사옹호 제목 테스트 (${TEST_KEYWORDS.length}개) ===\n`);
  const results: Array<{ kw: string; title: string; angle?: string }> = [];

  for (const keyword of TEST_KEYWORDS) {
    process.stdout.write(`▶ ${keyword.padEnd(30)} `);
    const prompt = buildCompetitorAdvocacyPrompt({
      keyword,
      keywordType: 'competitor',
    });
    const angleMatch = prompt.match(/콘텐츠 앵글: (\S+)/);
    const angle = angleMatch?.[1] ?? '?';

    try {
      const { content } = await generateViralContent({
        prompt,
        model: 'claude-sonnet-4-6',
      });
      const parsed = parseViralResponse(content);
      const rawTitleMatch = content.match(/\[제목\]\s*\n([^\n]+)/);
      const title = parsed?.subject ?? rawTitleMatch?.[1]?.trim() ?? '(추출실패)';
      console.log(`[${angle}] → ${title}`);
      results.push({ kw: keyword, title, angle });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 80) : String(e);
      console.log(`💥 ${msg}`);
      results.push({ kw: keyword, title: `ERROR: ${msg}`, angle });
    }
  }

  console.log('\n=== 요약 ===');
  for (const r of results) {
    const includesKw = r.title.includes(r.kw) ? '✅' : '❌';
    console.log(`${includesKw} [${r.angle?.padEnd(8)}] ${r.kw}`);
    console.log(`   → ${r.title}`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
