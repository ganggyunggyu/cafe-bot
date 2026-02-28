import { buildViralPrompt } from '../src/features/viral/viral-prompt';
import { parseViralResponse } from '../src/features/viral/viral-parser';
import fs from 'fs';
import path from 'path';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

const generateOne = async (keyword: string, style: '정보' | '일상' | '애니') => {
  const prompt = buildViralPrompt({ keyword, keywordType: 'own', contentType: 'lifestyle' }, style);
  console.log(`\n--- [${keyword}] 프롬프트 ${prompt.length}자, 스타일: ${style}, API 호출 중...`);

  const response = await fetch(`${CONTENT_API_URL}/generate/cafe-total`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword: prompt, ref: '' }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`[${keyword}] API 오류: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const parsed = parseViralResponse(data.content);
  console.log(`[${keyword}] 완료 - 모델: ${data.model}, ${data.char_count || data.content?.length}자, ${data.elapsed}ms`);
  if (parsed) {
    console.log(`  제목: "${parsed.title}", 댓글 ${parsed.comments.length}개`);
  }
  return { keyword, data, parsed };
};

const main = async () => {
  const testCases: { keyword: string; style: '정보' | '일상' | '애니'; label: string }[] = [
    { keyword: '기립성 저혈압 원인', style: '정보', label: '자사키워드' },
    { keyword: '면역력높이는방법', style: '정보', label: '자사키워드' },
    { keyword: '점심메뉴', style: '일상', label: '일상' },
  ];
  const results: { keyword: string; label: string; data: any; parsed: any }[] = [];

  for (const { keyword, style, label } of testCases) {
    console.log(`\n========== [${label}] ${keyword} ==========`);
    const result = await generateOne(keyword, style);
    results.push({ ...result, label });
  }

  const outPath = path.resolve(__dirname, '../viral-test-results.md');
  const sections = results.map(({ keyword, label, data, parsed }, idx) => {
    const lines = [
      `## ${idx + 1}. [${label}] 키워드: ${keyword}`,
      '',
      `- 모델: ${data.model || 'unknown'}`,
      `- 글자수: ${data.char_count || data.content?.length || 0}자`,
      `- 소요시간: ${data.elapsed || 0}ms`,
      '',
      '### AI 원문',
      '',
      data.content,
      '',
      '### 파싱 결과',
      '',
      parsed ? `**제목**: ${parsed.title}` : '파싱 실패',
      '',
      parsed ? `**본문** (${parsed.body.length}자): ${parsed.body}` : '',
      '',
      parsed ? `**댓글** (${parsed.comments.length}개):` : '',
      ...(parsed?.comments.map((c: any, i: number) => `${i + 1}. [${c.type}] ${c.content}`) || []),
    ];
    return lines.join('\n');
  });

  const output = [
    '# 프롬프트 개선 테스트 결과 (댓글러 quirk + 작성자 반박)',
    '',
    `생성일시: ${new Date().toLocaleString('ko-KR')}`,
    `테스트: 자사키워드 2건 + 일상 1건`,
    '',
    '---',
    '',
    ...sections.flatMap((s) => [s, '', '---', '']),
  ].join('\n');

  fs.writeFileSync(outPath, output, 'utf-8');
  console.log(`\n저장 완료: ${outPath}`);
};

main().catch((error) => {
  console.error('\n❌ 오류:', error instanceof Error ? error.message : error);
  process.exit(1);
});
