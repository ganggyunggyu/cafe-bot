import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

interface KeywordEntry {
  category: string;
  keyword: string;
}

const KEYWORDS: KeywordEntry[] = [
  { category: '임신준비', keyword: '관계 후 착상혈' },
  { category: '임신준비', keyword: '둘째임신' },
  { category: '산후조리', keyword: '계류유산 소파술 후 한약' },
  { category: '산후조리', keyword: '산후도우미 신청기간' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const generateOne = async (entry: KeywordEntry, idx: number) => {
  const prompt = buildOwnKeywordPrompt({ keyword: entry.keyword, keywordType: 'own' });

  const angleLine = prompt.split('\n').find((l) => l.includes('콘텐츠 앵글:'));
  const angleType = angleLine?.match(/콘텐츠 앵글: (.+?)\]/)?.[1] || '?';

  console.log(`  [${idx}] 앵글: ${angleType}`);

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
  return { content: data.content as string, angleType };
};

const main = async () => {
  console.log(`\n댓글 15~20개 원고 생성 (${KEYWORDS.length}개)`);
  console.log(`API: ${CONTENT_API_URL}\n`);

  const results: { category: string; keyword: string; angleType: string; content: string }[] = [];

  for (let i = 0; i < KEYWORDS.length; i++) {
    const entry = KEYWORDS[i];
    console.log(`--- ${i + 1}/${KEYWORDS.length} [${entry.category}] ${entry.keyword} ---`);
    try {
      const { content, angleType } = await generateOne(entry, i + 1);
      results.push({ category: entry.category, keyword: entry.keyword, angleType, content });
    } catch (err) {
      console.log(`      실패: ${err instanceof Error ? err.message : err}`);
    }
    if (i < KEYWORDS.length - 1) await sleep(3000);
  }

  const mdOutput = results
    .map((r, i) => `## ${i + 1}. [${r.category}] [${r.angleType}] ${r.keyword}\n\n${r.content}\n\n---\n`)
    .join('\n');

  const mdPath = path.resolve(__dirname, '../ref-test-results.md');
  const header = `# 댓글 확장 원고 테스트\n\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
  fs.writeFileSync(mdPath, header + mdOutput, 'utf-8');

  console.log(`\n저장: ${mdPath}`);
  console.log(`성공: ${results.length}/${KEYWORDS.length}`);
};

main().catch((err) => {
  console.error('\n오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
