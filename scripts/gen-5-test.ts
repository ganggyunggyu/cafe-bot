/**
 * 광고 프롬프트 5개 테스트 생성
 * Usage: npx tsx --env-file=.env.local scripts/gen-5-test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildOwnKeywordPrompt } from '../src/features/viral/prompts/build-own-keyword-prompt';
import { generateViralContent } from '../src/shared/api/content-api';

const KEYWORDS = process.argv.slice(2);

const OUTPUT_FILE = path.join(__dirname, '..', 'ref-test-results.md');

const main = async () => {
  const lines: string[] = [
    '# 광고 프롬프트 테스트 (제목 다양성 개선)',
    `> 생성 시각: ${new Date().toLocaleString('ko-KR')}`,
    '',
  ];

  for (const keyword of KEYWORDS) {
    console.log(`\n▶ ${keyword} 생성 중...`);
    const prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });

    try {
      const { content, model: usedModel } = await generateViralContent({ prompt });
      const angleMatch = prompt.match(/콘텐츠 앵글: (.+?)\]/);
      const angle = angleMatch ? angleMatch[1] : '알수없음';

      lines.push('---');
      lines.push(`## [건강식품] [${angle}] ${keyword}`);
      lines.push(`> model: ${usedModel || '알수없음'}`);
      lines.push('');
      lines.push(content);
      lines.push('');

      const titleMatch = content.match(/\[제목\]\s*\n(.+)/);
      console.log(`✅ ${titleMatch ? titleMatch[1].trim() : '(제목 파싱 실패)'}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lines.push(`## [건강식품] [에러] ${keyword}`);
      lines.push(`❌ ${msg}`);
      lines.push('');
      console.log(`❌ ${msg}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf-8');
  console.log(`\n📄 저장: ${OUTPUT_FILE}`);
};

main().catch(console.error);
