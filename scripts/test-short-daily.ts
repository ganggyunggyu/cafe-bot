import { buildShortDailyPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

const generateOne = async (keyword: string, idx: number) => {
  const prompt = buildShortDailyPrompt({ keyword, keywordType: 'own', contentType: 'lifestyle' });

  const moodLine = prompt.split('\n').find((l) => l.includes('분위기:'));
  const toneLine = prompt.split('\n').find((l) => l.includes('말투:'));
  console.log(`  [${idx}] ${moodLine?.trim()} / ${toneLine?.trim()}`);

  const response = await fetch(`${CONTENT_API_URL}/generate/cafe-total`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: prompt, ref: '' }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  console.log(`      완료 - ${data.model}, ${data.elapsed}ms`);
  return data.content as string;
};

const main = async () => {
  const keyword = process.argv[2] || '점심메뉴';
  const count = Number(process.argv[3]) || 3;

  console.log(`\n키워드: "${keyword}" / ${count}회 생성`);
  console.log(`API: ${CONTENT_API_URL}\n`);

  const results: string[] = [];

  for (let i = 1; i <= count; i++) {
    console.log(`--- ${i}/${count} ---`);
    const content = await generateOne(keyword, i);
    results.push(content);
  }

  const output = results
    .map((r, i) => `## ${i + 1}회차\n\n${r}\n\n---\n`)
    .join('\n');

  const outPath = path.resolve(__dirname, '../short-daily-test-results.md');
  const header = `# 일상 프롬프트 다양성 테스트\n\n키워드: ${keyword} / ${count}회\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
  fs.writeFileSync(outPath, header + output, 'utf-8');
  console.log(`\n저장: ${outPath}`);
};

main().catch((err) => {
  console.error('\n오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
