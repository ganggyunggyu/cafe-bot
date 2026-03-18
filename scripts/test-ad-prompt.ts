/**
 * 광고 프롬프트 출력 테스트
 * Usage: npx tsx --env-file=.env.local scripts/test-ad-prompt.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildOwnKeywordPrompt } from '../src/features/viral/prompts/build-own-keyword-prompt.backup';
import { generateViralContent } from '../src/shared/api/content-api';
import { parseViralResponse, validateParsedContent } from '../src/features/viral/viral-parser';

const TEST_KEYWORDS = [
  '흑염소진액효능',
  '수족냉증원인',
  '갱년기영양제',
  '만성피로',
  '산후조리음식',
  '흑염소효능',
  '손발차가움',
  '임산부영양제',
  '원기회복음식',
  '기력회복',
];

const OUTPUT_DIR = path.join(__dirname, 'artifacts');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'prompt-test-results.md');

const main = async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const lines: string[] = [
    `# 광고 프롬프트 테스트 결과`,
    `> 생성 시각: ${new Date().toLocaleString('ko-KR')}`,
    '',
  ];

  for (const keyword of TEST_KEYWORDS) {
    console.log(`\n▶ 키워드: ${keyword} 생성 중...`);

    const prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });

    try {
      const { content } = await generateViralContent({ prompt, model: 'gemini-3.1-flash-lite-preview' });

      lines.push(`${'─'.repeat(80)}`);
      lines.push(`## 키워드: ${keyword}`);
      lines.push('');
      const parsed = parseViralResponse(content);
      const validation = parsed ? validateParsedContent(parsed) : null;
      const parseStatus = parsed
        ? validation?.valid
          ? `✅ 파싱 OK (댓글 ${parsed.comments.length}개)`
          : `⚠️ 파싱됐지만 오류: ${validation?.errors.join(', ')}`
        : `❌ 파싱 실패`;

      lines.push(`> ${parseStatus}`);
      lines.push('');
      lines.push(content);
      lines.push('');

      console.log(`✅ 완료 | ${parseStatus}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lines.push(`## 키워드: ${keyword}`);
      lines.push(`❌ 에러: ${msg}`);
      lines.push('');
      console.log(`❌ 에러: ${msg}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf-8');
  console.log(`\n📄 결과 저장: ${OUTPUT_FILE}`);
};

main().catch(console.error);
