import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

const generateOne = async (keyword: string, idx: number) => {
  const prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });
  const angleLine = prompt.split('\n').find((l) => l.includes('콘텐츠 앵글'));
  const specLines = prompt.split('\n').filter((l) => l.trim().startsWith('- ') && l.includes('—'));
  console.log(`  [${idx}] ${angleLine?.trim()}`);
  console.log(`      스펙: ${specLines.length}개`);

  const response = await fetch(`${CONTENT_API_URL}/generate/cafe-total`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: prompt, ref: '' }),
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const data = await response.json();
  console.log(`      완료 - ${data.model}, ${data.elapsed}ms`);
  return { content: data.content as string, angle: angleLine?.match(/앵글: (.+?)\]/)?.[1] || '?' };
};

const main = async () => {
  const keywords = ['70대 할머니 선물', '시험관 착상에 좋은 음식', '흑염소진액 효능'];
  console.log(`\n다양한 앵글 테스트 - ${keywords.length}개 키워드\nAPI: ${CONTENT_API_URL}\n`);

  const results: { keyword: string; angle: string; content: string }[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const kw of keywords) {
    console.log(`--- [${kw}] ---`);
    try {
      const { content, angle } = await generateOne(kw, results.length + 1);
      results.push({ keyword: kw, angle, content });
    } catch (err) {
      console.log(`      실패: ${err instanceof Error ? err.message : err}`);
    }
    if (results.length < keywords.length) await sleep(3000);
  }

  const output = results
    .map((r, i) => `## ${i + 1}. [${r.angle}] ${r.keyword}\n\n${r.content}\n\n---\n`)
    .join('\n');

  const outPath = path.resolve(__dirname, '../own-keyword-test-results.md');
  const header = `# 콘텐츠 앵글 다양성 테스트\n\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
  fs.writeFileSync(outPath, header + output, 'utf-8');
  console.log(`\n저장: ${outPath}`);
};
main().catch(console.error);
