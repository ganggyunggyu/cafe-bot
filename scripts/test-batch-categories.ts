import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

interface KeywordEntry {
  category: string;
  keyword: string;
}

const CATEGORY_KEYWORDS: KeywordEntry[] = [
  { category: '건강식품', keyword: '기력보충 음식' },
  { category: '건강식품', keyword: '수족냉증 원인 치료' },
  { category: '건강식품', keyword: '피로회복 음식' },
  { category: '산후조리', keyword: '산모 음식' },
  { category: '산후조리', keyword: '출산후 영양제' },
  { category: '산후조리', keyword: '산후보약' },
  { category: '선물', keyword: '70대 할머니 선물' },
  { category: '선물', keyword: '60대 엄마 생일선물' },
  { category: '선물', keyword: '어머님 생신선물' },
  { category: '임신준비', keyword: '착상에 좋은 음식' },
  { category: '임신준비', keyword: '임신준비 영양제' },
  { category: '임신준비', keyword: '자궁에 좋은 음식' },
  { category: '흑염소제품', keyword: '흑염소 효능' },
  { category: '흑염소제품', keyword: '흑염소진액' },
  { category: '흑염소제품', keyword: '여자 흑염소' },
  { category: '타제품', keyword: '김소형 흑염소진액 효능' },
  { category: '타제품', keyword: '이경제 흑염소 진액진' },
  { category: '타제품', keyword: '천호 흑염소' },
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
  console.log(`\n카테고리별 키워드 원고 생성 (${CATEGORY_KEYWORDS.length}개)`);
  console.log(`API: ${CONTENT_API_URL}\n`);

  const results: { category: string; keyword: string; angleType: string; content: string }[] = [];

  for (let i = 0; i < CATEGORY_KEYWORDS.length; i++) {
    const entry = CATEGORY_KEYWORDS[i];
    console.log(`--- ${i + 1}/${CATEGORY_KEYWORDS.length} [${entry.category}] ${entry.keyword} ---`);
    try {
      const { content, angleType } = await generateOne(entry, i + 1);
      results.push({ category: entry.category, keyword: entry.keyword, angleType, content });
    } catch (err) {
      console.log(`      실패: ${err instanceof Error ? err.message : err}`);
    }
    if (i < CATEGORY_KEYWORDS.length - 1) await sleep(3000);
  }

  // MD 출력
  const mdOutput = results
    .map((r, i) => `## ${i + 1}. [${r.category}] [${r.angleType}] ${r.keyword}\n\n${r.content}\n\n---\n`)
    .join('\n');

  const mdPath = path.resolve(__dirname, '../batch-test-results.md');
  const header = `# 카테고리별 원고 테스트\n\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n`;
  fs.writeFileSync(mdPath, header + mdOutput, 'utf-8');

  // TSV 출력 (구글 시트 붙여넣기용)
  const tsvRows = results.map((r) => {
    const lines = r.content.split('\n');
    const titleLine = lines.find((l) => l.startsWith('[제목]'));
    const titleIdx = lines.indexOf(titleLine || '');
    const title = titleIdx >= 0 ? lines[titleIdx + 1]?.trim() : '';

    const bodyStart = lines.indexOf('[본문]');
    const commentStart = lines.indexOf('[댓글]');
    const body = bodyStart >= 0 && commentStart >= 0
      ? lines.slice(bodyStart + 1, commentStart).join('\n').trim()
      : '';

    const comments = commentStart >= 0
      ? lines.slice(commentStart + 1).join('\n').trim()
      : '';

    return `${r.keyword}\t${r.category}\t${r.angleType}\t${title}\t${body}\t${comments}`;
  });

  const tsvHeader = '키워드\t카테고리\t원고유형\t제목\t본문\t댓글';
  const tsvPath = path.resolve(__dirname, '../batch-test-results.tsv');
  fs.writeFileSync(tsvPath, tsvHeader + '\n' + tsvRows.join('\n'), 'utf-8');

  console.log(`\n저장:`);
  console.log(`  MD: ${mdPath}`);
  console.log(`  TSV: ${tsvPath} (구글 시트 붙여넣기용)`);
  console.log(`\n성공: ${results.length}/${CATEGORY_KEYWORDS.length}`);
};

main().catch((err) => {
  console.error('\n오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
