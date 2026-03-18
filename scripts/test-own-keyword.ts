import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

const generateOne = async (keyword: string, idx: number) => {
  const prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });

  const seedLine = prompt.split('\n').find((l) => l.includes('페르소나:'));
  const startLine = prompt.split('\n').find((l) => l.includes('본문 시작'));
  console.log(`\n  [${idx}] ${seedLine?.trim()}`);
  console.log(`      ${startLine?.trim()}`);

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
  const singleKeyword = process.argv[2];
  const count = Number(process.argv[3]) || 3;

  const MULTI_KEYWORDS = [
    '흑염소진액 효능',
    '흑염소즙 추천',
    '기력보충 영양제',
    '피로회복 보양식',
    '면역력 높이는 방법',
    '손발차가운 사람 영양제',
    '갱년기 보양식',
    '산후조리 보양',
    '허약체질 영양제',
    '원기회복 음식',
  ];

  const isMulti = !singleKeyword;
  const keywords = isMulti ? MULTI_KEYWORDS : [singleKeyword];
  const perKeyword = isMulti ? 1 : count;

  console.log(isMulti
    ? `\n다양한 키워드 ${keywords.length}개 x ${perKeyword}회 생성`
    : `\n키워드: "${singleKeyword}" / ${count}회 생성`
  );
  console.log(`API: ${CONTENT_API_URL}\n`);

  const results: { keyword: string; content: string }[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const kw of keywords) {
    for (let i = 1; i <= perKeyword; i++) {
      const label = isMulti ? `${results.length + 1}/${keywords.length}` : `${i}/${count}`;
      console.log(`--- ${label} [${kw}] ---`);
      try {
        const content = await generateOne(kw, results.length + 1);
        results.push({ keyword: kw, content });
      } catch (err) {
        console.log(`      실패: ${err instanceof Error ? err.message : err}`);
      }
      if (results.length < keywords.length * perKeyword) await sleep(3000);
    }
  }

  const output = results
    .map((r, i) => `## ${i + 1}. ${r.keyword}\n\n${r.content}\n\n---\n`)
    .join('\n');

  const outPath = path.resolve(__dirname, '../own-keyword-test-results.md');
  const keywordLabel = isMulti ? `다양한 키워드 ${keywords.length}개` : `${singleKeyword} / ${count}회`;
  const header = `# 자사키워드 프롬프트 다양성 테스트\n\n${keywordLabel}\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
  fs.writeFileSync(outPath, header + output, 'utf-8');
  console.log(`\n저장: ${outPath}`);
};

main().catch((err) => {
  console.error('\n오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
