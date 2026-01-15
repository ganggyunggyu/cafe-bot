// 댓글 응답 파싱 테스트

interface ParsedComment {
  index: number;
  type: 'comment' | 'author_reply' | 'commenter_reply' | 'other_reply';
  parentIndex?: number;
  content: string;
}

// 새 포맷: [태그] 형식
const COMMENT_PATTERNS = {
  comment: /^\[댓글(\d+)\]\s+(.+)$/,           // [댓글1] 내용
  authorReply: /^\[작성자-(\d+)\]\s+(.+)$/,    // [작성자-1] 내용
  commenterReply: /^\[댓글러-(\d+)\]\s+(.+)$/, // [댓글러-1] 내용
  otherReply: /^\[제3자-(\d+)\]\s+(.+)$/,      // [제3자-1] 내용
};

// 레거시 포맷 (하위 호환)
const LEGACY_PATTERNS = {
  comment: /^댓글\s*(\d+)\s+(.+)$/,
  authorReply: /^[☆]\s*댓글\s*(\d+)\s+(.+)$/,
  commenterReply: /^[★]\s*댓글\s*(\d+)\s+(.+)$/,
  otherReply: /^[○◯〇]\s*댓글\s*(\d+)\s+(.+)$/,
  markerComment: /^[☆★○◯〇]\s*댓글\s+(.+)$/,
};

function parseCommentResponse(response: string): ParsedComment[] {
  const lines = response.split('\n').filter(line => line.trim());
  const results: ParsedComment[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 1. 새 포맷: [댓글N] 내용
    const commentMatch = trimmed.match(COMMENT_PATTERNS.comment);
    if (commentMatch) {
      results.push({
        index: parseInt(commentMatch[1]),
        type: 'comment',
        content: commentMatch[2],
      });
      continue;
    }

    // 2. 새 포맷: [작성자-N] 내용
    const authorMatch = trimmed.match(COMMENT_PATTERNS.authorReply);
    if (authorMatch) {
      results.push({
        index: results.length + 1,
        type: 'author_reply',
        parentIndex: parseInt(authorMatch[1]),
        content: authorMatch[2],
      });
      continue;
    }

    // 3. 새 포맷: [댓글러-N] 내용
    const commenterMatch = trimmed.match(COMMENT_PATTERNS.commenterReply);
    if (commenterMatch) {
      results.push({
        index: results.length + 1,
        type: 'commenter_reply',
        parentIndex: parseInt(commenterMatch[1]),
        content: commenterMatch[2],
      });
      continue;
    }

    // 4. 새 포맷: [제3자-N] 내용
    const otherMatch = trimmed.match(COMMENT_PATTERNS.otherReply);
    if (otherMatch) {
      results.push({
        index: results.length + 1,
        type: 'other_reply',
        parentIndex: parseInt(otherMatch[1]),
        content: otherMatch[2],
      });
      continue;
    }

    // === 레거시 포맷 하위 호환 ===

    const legacyCommentMatch = trimmed.match(LEGACY_PATTERNS.comment);
    if (legacyCommentMatch) {
      results.push({
        index: parseInt(legacyCommentMatch[1]),
        type: 'comment',
        content: legacyCommentMatch[2],
      });
      continue;
    }

    const legacyAuthorMatch = trimmed.match(LEGACY_PATTERNS.authorReply);
    if (legacyAuthorMatch) {
      results.push({
        index: results.length + 1,
        type: 'author_reply',
        parentIndex: parseInt(legacyAuthorMatch[1]),
        content: legacyAuthorMatch[2],
      });
      continue;
    }

    const legacyCommenterMatch = trimmed.match(LEGACY_PATTERNS.commenterReply);
    if (legacyCommenterMatch) {
      results.push({
        index: results.length + 1,
        type: 'commenter_reply',
        parentIndex: parseInt(legacyCommenterMatch[1]),
        content: legacyCommenterMatch[2],
      });
      continue;
    }

    const legacyOtherMatch = trimmed.match(LEGACY_PATTERNS.otherReply);
    if (legacyOtherMatch) {
      results.push({
        index: results.length + 1,
        type: 'other_reply',
        parentIndex: parseInt(legacyOtherMatch[1]),
        content: legacyOtherMatch[2],
      });
      continue;
    }

    const markerCommentMatch = trimmed.match(LEGACY_PATTERNS.markerComment);
    if (markerCommentMatch) {
      results.push({
        index: results.length + 1,
        type: 'comment',
        content: markerCommentMatch[1],
      });
      continue;
    }

    // === Fallback ===
    if (trimmed === '댓글' || trimmed === '') {
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)[.\s]\s*(.+)$/);
    if (numberedMatch) {
      results.push({
        index: parseInt(numberedMatch[1]),
        type: 'comment',
        content: numberedMatch[2],
      });
      continue;
    }
  }

  return results;
}

// 테스트 데이터
const testInput = `댓글1 부모님 건강 챙겨드리는 마음이 참 예쁘시네요. 저희 집도 작년에 비슷한 고민 했어서 남 일 같지가 않아요.

댓글2 천녹 유명하죠. 저도 명절에 시댁 선물로 보냈었는데 포장이 고급스러워서 일단 받으실 때 기분은 좋아하시더라고요.
☆댓글2 오 역시 선물용으로는 인지도가 중요한가 봐요. 효과는 좀 보셨다고 하시나요?
★댓글2 저희 시어머니는 그냥저냥 먹을만하다고 하셨는데, 드라마틱한 건 잘 모르겠다고 하셨어요. 사람마다 다른 듯요.

댓글3 저도 브랜드 위주로 보다가 한려담원 흑염소진액으로 드렸거든요. 흑염소가 기력 보충에 좋대서 여러 개 비교해보고 골랐는데 저희 부모님은 이게 더 잘 맞는다고 하시네요.
☆댓글3 한려담원이요? 그건 처음 들어보는데 함량이나 이런 게 괜찮나요?
★댓글3 네 저도 꼼꼼히 봤는데 잡내도 안 나고 진해서 좋더라고요. 드시고 나서 확실히 아침에 일어날 때 몸이 좀 가벼워지셨대요.
○댓글3 아 저도 한려담원 아는데! 이거 수족냉증 있는 분들한테도 좋다고 해서 저도 같이 먹고 있어요.

댓글4 비교해보는 게 정답이죠. 이름값도 무시 못 하지만 실속 챙기는 게 최고더라고요.

댓글5 저도 천녹이랑 한려담원 고민하다가 후기 보고 한려담원 선택했는데 만족해요. 부모님이 원기회복 되는 느낌이라고 하셔서 이번에 또 주문해드리려고요.
☆댓글5 다들 비슷하게 고민하시네요ㅎㅎ 정보 감사합니다. 저도 한 번 찾아봐야겠어요.

댓글6 좋은 선물 고르셨으면 좋겠네요. 부모님 건강이 최고죠ㅠㅠ

댓글7 천녹 광고 보고 사려다가 생각보다 가격대가 쎄서 망설여지긴 하더라고요. 저도 다른 추천 제품들 좀 참고해야겠어요.
☆댓글7 맞아요 가격이 만만치 않아서 더 물어보게 되네요.

댓글8 부모님 혹시 흑염소는 처음 드시는 건가요? 처음이면 한려담원이 목 넘김도 편하고 무난하실 거예요. 저도 선물용으로 꽤 많이 알아봤거든요.`;

// 파싱 실행
const parsed = parseCommentResponse(testInput);

console.log('=== 파싱 결과 ===\n');
console.log(`총 ${parsed.length}개 항목 파싱됨\n`);

// 타입별 통계
const stats = {
  comment: parsed.filter(p => p.type === 'comment').length,
  author_reply: parsed.filter(p => p.type === 'author_reply').length,
  commenter_reply: parsed.filter(p => p.type === 'commenter_reply').length,
  other_reply: parsed.filter(p => p.type === 'other_reply').length,
};

console.log('타입별 통계:');
console.log(`  - 일반 댓글: ${stats.comment}개`);
console.log(`  - 글쓴이 대댓글 (☆): ${stats.author_reply}개`);
console.log(`  - 댓글러 답변 (★): ${stats.commenter_reply}개`);
console.log(`  - 제3자 대댓글 (○): ${stats.other_reply}개`);

console.log('\n=== 상세 결과 ===\n');
parsed.forEach((item, i) => {
  const parentInfo = item.parentIndex ? ` → 댓글${item.parentIndex}에 대댓글` : '';
  console.log(`[${i + 1}] ${item.type}${parentInfo}`);
  console.log(`    ${item.content.substring(0, 50)}${item.content.length > 50 ? '...' : ''}`);
});

// 구조 검증
console.log('\n=== 구조 검증 ===\n');

const comments = parsed.filter(p => p.type === 'comment');
const replies = parsed.filter(p => p.type !== 'comment');

// 모든 대댓글이 유효한 댓글을 참조하는지 확인
const invalidReplies = replies.filter(r => {
  const parentExists = comments.some(c => c.index === r.parentIndex);
  return !parentExists;
});

if (invalidReplies.length === 0) {
  console.log('✓ 모든 대댓글이 유효한 부모 댓글을 참조함');
} else {
  console.log('✗ 유효하지 않은 대댓글 참조 발견:');
  invalidReplies.forEach(r => {
    console.log(`  - ${r.type}: 댓글${r.parentIndex} 참조 (존재하지 않음)`);
  });
}

// 댓글 순서 검증
const commentIndices = comments.map(c => c.index);
const isSequential = commentIndices.every((idx, i) => idx === i + 1);
console.log(isSequential
  ? '✓ 댓글 번호가 순차적임 (1, 2, 3, ...)'
  : '✗ 댓글 번호가 비순차적임');

console.log('\n=== 안정성 평가 ===\n');
console.log('1. 정규식 패턴: 단순하고 명확함 - 안정적');
console.log('2. 특수문자(☆★○): UTF-8 지원 필요 - 대부분 환경에서 OK');
console.log('3. 줄바꿈 처리: split("\\n")으로 처리 - 안정적');
console.log('4. 공백 처리: trim()으로 처리 - 안정적');
console.log('5. 에지 케이스: 빈 줄, 잘못된 형식 무시 - 안정적');
