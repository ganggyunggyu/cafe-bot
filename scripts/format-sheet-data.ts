import fs from 'fs';
import path from 'path';

const md = fs.readFileSync(path.resolve(__dirname, '../batch-test-results.md'), 'utf-8');

const entries = md.split(/^## \d+\./m).slice(1);

const results: { category: string; keyword: string; angleType: string; title: string; body: string; comments: string; quality: string }[] = [];

for (const entry of entries) {
  const headerMatch = entry.match(/\[(.+?)\] \[(.+?)\] (.+)/);
  if (!headerMatch) continue;

  const [, category, angleType, keyword] = headerMatch;

  const lines = entry.split('\n');

  let title = '';
  let body = '';
  let comments = '';

  const titleIdx = lines.findIndex((l) => l.trim() === '[제목]');
  const bodyIdx = lines.findIndex((l) => l.trim() === '[본문]');
  const commentIdx = lines.findIndex((l) => l.trim() === '[댓글]');

  if (titleIdx >= 0) {
    const nextSection = bodyIdx >= 0 ? bodyIdx : lines.length;
    title = lines.slice(titleIdx + 1, nextSection).map((l) => l.trim()).filter(Boolean).join(' ');
  } else {
    // [제목] 태그 없이 바로 제목이 온 경우
    const contentStart = lines.findIndex((l, i) => i > 0 && l.trim() && !l.startsWith('['));
    if (contentStart >= 0) {
      title = lines[contentStart].trim();
    }
  }

  if (bodyIdx >= 0) {
    const endIdx = commentIdx >= 0 ? commentIdx : lines.length;
    body = lines.slice(bodyIdx + 1, endIdx).join('\n').trim();
  } else if (titleIdx < 0) {
    // [본문], [제목] 태그 없는 비정상 포맷
    const firstCommentLine = lines.findIndex((l) => l.trim().startsWith('[댓글'));
    const contentLines = lines.slice(2, firstCommentLine >= 0 ? firstCommentLine : lines.length);
    const titleLine = contentLines.findIndex((l) => l.trim());
    if (titleLine >= 0) {
      title = contentLines[titleLine].trim();
      body = contentLines.slice(titleLine + 1).join('\n').trim();
    }
  }

  if (commentIdx >= 0) {
    const endIdx = lines.findIndex((l, i) => i > commentIdx && l.trim() === '---');
    comments = lines.slice(commentIdx + 1, endIdx >= 0 ? endIdx : lines.length)
      .join('\n').trim();
  } else {
    // [댓글] 태그 없이 [댓글1]로 바로 시작
    const firstComment = lines.findIndex((l) => /^\[댓글\d+\]/.test(l.trim()));
    if (firstComment >= 0) {
      const endIdx = lines.findIndex((l, i) => i > firstComment && l.trim() === '---');
      comments = lines.slice(firstComment, endIdx >= 0 ? endIdx : lines.length)
        .join('\n').trim();
    }
  }

  // 품질 검토
  const issues: string[] = [];

  // 제목 길이 체크
  if (title.length > 30) issues.push('제목 긴편');
  if (title.length === 0) issues.push('제목 누락');

  // 본문 길이 체크 (공백 제외)
  const bodyNoSpace = body.replace(/\s/g, '').length;
  if (bodyNoSpace < 250) issues.push(`본문 짧음(${bodyNoSpace}자)`);
  if (bodyNoSpace > 450) issues.push(`본문 김(${bodyNoSpace}자)`);

  // 키워드 포함 체크
  const kwCount = (body.match(new RegExp(keyword.trim(), 'g')) || []).length;
  if (kwCount < 2) issues.push(`키워드 ${kwCount}회`);

  // 댓글 수 체크
  const commentLines = comments.split('\n').filter((l) => /^\[댓글\d+\]/.test(l.trim()));
  if (commentLines.length < 5) issues.push(`댓글 ${commentLines.length}개`);

  // 한,려담원 언급 확인
  const hasProduct = comments.includes('한,려담원') || comments.includes('한려담원');
  if (!hasProduct) issues.push('제품 미언급');

  // 반박/의심 댓글 체크
  const suspiciousKeywords = ['체질', '안 맞', '부작용', '냄새', '비린', '누린', '살 찌', '조심', '간에'];
  const hasSuspicious = suspiciousKeywords.some((k) => comments.includes(k));
  if (!hasSuspicious) issues.push('반박댓글 없음');

  const quality = issues.length === 0 ? 'GOOD' : issues.join(', ');

  results.push({ category, keyword: keyword.trim(), angleType, title, body, comments, quality });
}

// TSV 출력 (탭 구분, 줄바꿈은 셀 내 유지를 위해 큰따옴표로 감싸기)
const escapeCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

const tsvHeader = '키워드\t카테고리\t원고유형\t제목\t본문\t댓글\t품질검토';
const tsvRows = results.map((r) =>
  [r.keyword, r.category, r.angleType, r.title, escapeCell(r.body), escapeCell(r.comments), r.quality].join('\t')
);

const tsvPath = path.resolve(__dirname, '../batch-test-sheet.tsv');
fs.writeFileSync(tsvPath, tsvHeader + '\n' + tsvRows.join('\n'), 'utf-8');

console.log(`\n=== 품질 검토 결과 ===\n`);
results.forEach((r, i) => {
  const icon = r.quality === 'GOOD' ? 'O' : 'X';
  console.log(`${icon} ${i + 1}. [${r.category}][${r.angleType}] ${r.keyword}`);
  console.log(`  제목: ${r.title}`);
  if (r.quality !== 'GOOD') console.log(`  이슈: ${r.quality}`);
  console.log('');
});

const goodCount = results.filter((r) => r.quality === 'GOOD').length;
console.log(`합격: ${goodCount}/${results.length}\n`);
console.log(`TSV 저장: ${tsvPath}`);
