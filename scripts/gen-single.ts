import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';

const keyword = process.argv[2];
const category = process.argv[3];
const outputFile = process.argv[4];

if (!keyword || !category || !outputFile) {
  console.error('Usage: npx tsx gen-single.ts <keyword> <category> <outputFile>');
  process.exit(1);
}

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

const run = async () => {
  const prompt = buildOwnKeywordPrompt({ keyword: keyword!, keywordType: 'own' });
  const angleLine = prompt.split('\n').find((l) => l.includes('콘텐츠 앵글:'));
  const angleType = angleLine?.match(/콘텐츠 앵글: (.+?)\]/)?.[1] || '?';

  const routeLine = prompt.split('\n').find((l) => l.includes('제품 발견 경로'));
  const hasRoute = routeLine && !routeLine.includes('언급하지 말 것');
  console.log(`앵글: ${angleType} | 경로: ${hasRoute ? '있음' : '없음'}`);

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
  const result = `## [${category}] [${angleType}] ${keyword}\n\n${data.content}\n\n---\n`;
  fs.writeFileSync(outputFile!, result, 'utf-8');
  console.log(`완료: ${keyword} (${angleType}, ${data.model}, ${data.elapsed}ms)`);
};

run();
