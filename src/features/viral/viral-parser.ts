export type CommentType =
  | 'comment'
  | 'author_reply'
  | 'commenter_reply'
  | 'other_reply';

export interface ParsedComment {
  index: number;
  type: CommentType;
  parentIndex?: number;
  content: string;
}

export interface ParsedViralContent {
  title: string;
  body: string;
  comments: ParsedComment[];
}

// 새 포맷: [태그] 형식
// [댓글1] 내용 - 일반 댓글
// [작성자-1] 내용 - 댓글1에 대한 작성자 대댓글
// [댓글러-1] 내용 - 댓글1에 대한 댓글러 대댓글
// [제3자-1] 내용 - 댓글1에 대한 제3자 대댓글
const COMMENT_PATTERNS = {
  // [댓글1] 내용
  comment: /^\[댓글(\d+)\]\s+(.+)$/,
  // [작성자-1] 내용
  authorReply: /^\[작성자-(\d+)\]\s+(.+)$/,
  // [댓글러-1] 내용
  commenterReply: /^\[댓글러-(\d+)\]\s+(.+)$/,
  // [제3자-1] 내용
  otherReply: /^\[제3자-(\d+)\]\s+(.+)$/,
};

// 레거시 포맷 (하위 호환)
const LEGACY_PATTERNS = {
  comment: /^댓글\s*(\d+)\s+(.+)$/,
  authorReply: /^[☆]\s*댓글\s*(\d+)\s+(.+)$/,
  commenterReply: /^[★]\s*댓글\s*(\d+)\s+(.+)$/,
  otherReply: /^[○◯〇]\s*댓글\s*(\d+)\s+(.+)$/,
  markerComment: /^[☆★○◯〇]\s*댓글\s+(.+)$/,
};

export const parseViralResponse = (
  response: string
): ParsedViralContent | null => {
  try {
    const titleMatch = response.match(/\[제목\]\s*\n([\s\S]+?)(?=\n\n|\n\[)/);
    const bodyMatch = response.match(/\[본문\]\s*\n([\s\S]+?)(?=\n\[댓글\])/);
    const commentsMatch = response.match(/\[댓글\]\s*\n([\s\S]+?)$/);

    if (!titleMatch || !bodyMatch || !commentsMatch) {
      console.error('[PARSER] 필수 섹션 파싱 실패');
      return null;
    }

    const title = titleMatch[1].trim();
    const body = bodyMatch[1].trim();
    const commentsRaw = commentsMatch[1];

    const comments = parseComments(commentsRaw);

    return { title, body, comments };
  } catch (error) {
    console.error('[PARSER] 파싱 오류:', error);
    return null;
  }
}

// 태그만 있는 줄 (내용이 다음 줄에 있는 경우)
// 설명이 붙은 경우도 처리: [댓글1] 일반, [작성자-1] 글쓴이 답댓 등
const TAG_ONLY_PATTERNS = {
  comment: /^\[댓글(\d+)\](?:\s+일반)?$/,
  authorReply: /^\[작성자-(\d+)\](?:\s+글쓴이\s*답댓)?$/,
  commenterReply: /^\[댓글러-(\d+)\](?:\s+원댓글\s*작성자\s*재답)?$/,
  otherReply: /^\[제3자-(\d+)\](?:\s+다른\s*사람\s*답댓)?$/,
};

const parseComments = (raw: string): ParsedComment[] => {
  const lines = raw.split('\n');
  const results: ParsedComment[] = [];
  let commentCounter = 0;
  let pendingTag: { type: CommentType; index?: number; parentIndex?: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // 이전 태그가 있고 현재 줄이 내용이면 결합
    if (pendingTag && !trimmed.startsWith('[')) {
      if (pendingTag.type === 'comment') {
        commentCounter++;
        results.push({
          index: pendingTag.index ?? commentCounter,
          type: 'comment',
          content: trimmed,
        });
      } else {
        results.push({
          index: results.length + 1,
          type: pendingTag.type,
          parentIndex: pendingTag.parentIndex,
          content: trimmed,
        });
      }
      pendingTag = null;
      continue;
    }

    pendingTag = null;

    // === 태그만 있는 줄 체크 (멀티라인 포맷) ===
    const tagOnlyComment = trimmed.match(TAG_ONLY_PATTERNS.comment);
    if (tagOnlyComment) {
      pendingTag = { type: 'comment', index: parseInt(tagOnlyComment[1]) };
      continue;
    }

    const tagOnlyAuthor = trimmed.match(TAG_ONLY_PATTERNS.authorReply);
    if (tagOnlyAuthor) {
      pendingTag = { type: 'author_reply', parentIndex: parseInt(tagOnlyAuthor[1]) };
      continue;
    }

    const tagOnlyCommenter = trimmed.match(TAG_ONLY_PATTERNS.commenterReply);
    if (tagOnlyCommenter) {
      pendingTag = { type: 'commenter_reply', parentIndex: parseInt(tagOnlyCommenter[1]) };
      continue;
    }

    const tagOnlyOther = trimmed.match(TAG_ONLY_PATTERNS.otherReply);
    if (tagOnlyOther) {
      pendingTag = { type: 'other_reply', parentIndex: parseInt(tagOnlyOther[1]) };
      continue;
    }

    // === 인라인 포맷 (태그와 내용이 같은 줄) ===

    // 1. 새 포맷: [댓글N] 내용
    const commentMatch = trimmed.match(COMMENT_PATTERNS.comment);
    if (commentMatch) {
      commentCounter++;
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

    // 5. 레거시: 댓글N 내용
    const legacyCommentMatch = trimmed.match(LEGACY_PATTERNS.comment);
    if (legacyCommentMatch) {
      commentCounter++;
      results.push({
        index: parseInt(legacyCommentMatch[1]),
        type: 'comment',
        content: legacyCommentMatch[2],
      });
      continue;
    }

    // 6. 레거시: ☆댓글N 내용
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

    // 7. 레거시: ★댓글N 내용
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

    // 8. 레거시: ○댓글N 내용
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

    // 9. 레거시: ○댓글 내용 (숫자 없음 = 일반 댓글)
    const markerCommentMatch = trimmed.match(LEGACY_PATTERNS.markerComment);
    if (markerCommentMatch) {
      commentCounter++;
      results.push({
        index: commentCounter,
        type: 'comment',
        content: markerCommentMatch[1],
      });
      continue;
    }

    // === Fallback ===
    if (trimmed === '댓글' || trimmed === '') {
      continue;
    }

    // 숫자로 시작하는 줄 (예: "1. 댓글내용")
    const numberedMatch = trimmed.match(/^(\d+)[.\s]\s*(.+)$/);
    if (numberedMatch) {
      commentCounter++;
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

export const getCommentStats = (comments: ParsedComment[]) => {
  return {
    total: comments.length,
    comment: comments.filter((c) => c.type === 'comment').length,
    authorReply: comments.filter((c) => c.type === 'author_reply').length,
    commenterReply: comments.filter((c) => c.type === 'commenter_reply').length,
    otherReply: comments.filter((c) => c.type === 'other_reply').length,
  };
}

export const validateParsedContent = (content: ParsedViralContent): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!content.title || content.title.length === 0) {
    errors.push('제목이 비어있음');
  }
  if (content.title.length > 50) {
    errors.push(`제목이 너무 김 (${content.title.length}자)`);
  }

  if (!content.body || content.body.length < 100) {
    errors.push('본문이 너무 짧음');
  }

  if (content.comments.length < 3) {
    errors.push(`댓글이 너무 적음 (${content.comments.length}개)`);
  }

  const mainComments = content.comments.filter((c) => c.type === 'comment');
  const replies = content.comments.filter((c) => c.type !== 'comment');

  for (const reply of replies) {
    const parentExists = mainComments.some(
      (c) => c.index === reply.parentIndex
    );
    if (!parentExists) {
      errors.push(
        `댓글${reply.parentIndex}를 참조하는 대댓글이 있지만 부모 댓글이 없음`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
