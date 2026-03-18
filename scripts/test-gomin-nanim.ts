import { buildOwnKeywordPrompt } from '../src/features/viral/prompts';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

const main = async () => {
  const keyword = '수원 난임병원';

  // 고민형이 나올 때까지 프롬프트 재생성
  let prompt = '';
  let angleType = '';
  for (let retry = 0; retry < 20; retry++) {
    prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });
    const angleLine = prompt.split('\n').find((l) => l.includes('콘텐츠 앵글:'));
    angleType = angleLine?.match(/콘텐츠 앵글: (.+?)\]/)?.[1] || '?';
    if (angleType === '고민형') break;
  }

  console.log(`앵글: ${angleType}`);
  if (angleType !== '고민형') {
    console.log('고민형이 안 걸림 — 다시 실행해주세요');
    return;
  }

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
  console.log(`완료 - ${data.model}, ${data.elapsed}ms\n`);
  console.log(data.content);

  const mdPath = path.resolve(__dirname, '../ref-test-results.md');
  const mdOutput = `# 고민형 난임병원 테스트\n\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n---\n\n## 1. [임신준비] [고민형] ${keyword}\n\n${data.content}\n\n---\n`;
  fs.writeFileSync(mdPath, mdOutput, 'utf-8');
  console.log(`\n저장: ${mdPath}`);
};

main().catch((err) => {
  console.error('\n오류:', err instanceof Error ? err.message : err);
  process.exit(1);
});
