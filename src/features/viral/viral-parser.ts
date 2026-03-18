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

const stripMarkdown = (text: string): string =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`(.+?)`/g, '$1');

export const parseViralResponse = (
  response: string
): ParsedViralContent | null => {
  try {
    const titleMatch = response.match(/\[제목\]\s*\n([\s\S]+?)(?=\n\n|\n\[)/);
    const bodyMatch = response.match(/\[본문\]\s*\n([\s\S]+?)(?=\n\[댓글)/);
    const commentsMatch =
      response.match(/\[댓글\]\s*\n([\s\S]+?)$/) ??
      (() => { const m = response.match(/(\[댓글\d[\s\S]+?)$/); return m ? [m[0], m[1]] : null; })();

    if (!titleMatch || !bodyMatch || !commentsMatch) {
      console.error('[PARSER] 필수 섹션 파싱 실패');
      return null;
    }

    const title = stripMarkdown(titleMatch[1].trim());
    const body = stripMarkdown(bodyMatch[1].trim());
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

interface PendingComment {
  type: CommentType;
  index: number;
  parentIndex?: number;
  contentLines: string[];
}

const parseComments = (raw: string): ParsedComment[] => {
  const lines = raw.split('\n');
  const results: ParsedComment[] = [];
  let commentCounter = 0;
  let current: PendingComment | null = null;

  const finalizeCurrent = () => {
    if (current && current.contentLines.length > 0) {
      results.push({
        index: current.index,
        type: current.type,
        parentIndex: current.parentIndex,
        content: current.contentLines.join('\n'),
      });
    }
    current = null;
  };

  const startComment = (type: CommentType, index: number, firstLine?: string, parentIndex?: number) => {
    finalizeCurrent();
    current = {
      type,
      index,
      parentIndex,
      contentLines: firstLine ? [firstLine] : [],
    };
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // === 태그만 있는 줄 체크 (멀티라인 포맷) ===
    const tagOnlyComment = trimmed.match(TAG_ONLY_PATTERNS.comment);
    if (tagOnlyComment) {
      commentCounter++;
      startComment('comment', parseInt(tagOnlyComment[1]));
      continue;
    }

    const tagOnlyAuthor = trimmed.match(TAG_ONLY_PATTERNS.authorReply);
    if (tagOnlyAuthor) {
      startComment('author_reply', results.length + 1, undefined, parseInt(tagOnlyAuthor[1]));
      continue;
    }

    const tagOnlyCommenter = trimmed.match(TAG_ONLY_PATTERNS.commenterReply);
    if (tagOnlyCommenter) {
      startComment('commenter_reply', results.length + 1, undefined, parseInt(tagOnlyCommenter[1]));
      continue;
    }

    const tagOnlyOther = trimmed.match(TAG_ONLY_PATTERNS.otherReply);
    if (tagOnlyOther) {
      startComment('other_reply', results.length + 1, undefined, parseInt(tagOnlyOther[1]));
      continue;
    }

    // === 인라인 포맷 (태그와 내용이 같은 줄) ===

    const commentMatch = trimmed.match(COMMENT_PATTERNS.comment);
    if (commentMatch) {
      commentCounter++;
      startComment('comment', parseInt(commentMatch[1]), commentMatch[2]);
      continue;
    }

    const authorMatch = trimmed.match(COMMENT_PATTERNS.authorReply);
    if (authorMatch) {
      startComment('author_reply', results.length + 1, authorMatch[2], parseInt(authorMatch[1]));
      continue;
    }

    const commenterMatch = trimmed.match(COMMENT_PATTERNS.commenterReply);
    if (commenterMatch) {
      startComment('commenter_reply', results.length + 1, commenterMatch[2], parseInt(commenterMatch[1]));
      continue;
    }

    const otherMatch = trimmed.match(COMMENT_PATTERNS.otherReply);
    if (otherMatch) {
      startComment('other_reply', results.length + 1, otherMatch[2], parseInt(otherMatch[1]));
      continue;
    }

    // === 레거시 포맷 하위 호환 ===

    const legacyCommentMatch = trimmed.match(LEGACY_PATTERNS.comment);
    if (legacyCommentMatch) {
      commentCounter++;
      startComment('comment', parseInt(legacyCommentMatch[1]), legacyCommentMatch[2]);
      continue;
    }

    const legacyAuthorMatch = trimmed.match(LEGACY_PATTERNS.authorReply);
    if (legacyAuthorMatch) {
      startComment('author_reply', results.length + 1, legacyAuthorMatch[2], parseInt(legacyAuthorMatch[1]));
      continue;
    }

    const legacyCommenterMatch = trimmed.match(LEGACY_PATTERNS.commenterReply);
    if (legacyCommenterMatch) {
      startComment('commenter_reply', results.length + 1, legacyCommenterMatch[2], parseInt(legacyCommenterMatch[1]));
      continue;
    }

    const legacyOtherMatch = trimmed.match(LEGACY_PATTERNS.otherReply);
    if (legacyOtherMatch) {
      startComment('other_reply', results.length + 1, legacyOtherMatch[2], parseInt(legacyOtherMatch[1]));
      continue;
    }

    const markerCommentMatch = trimmed.match(LEGACY_PATTERNS.markerComment);
    if (markerCommentMatch) {
      commentCounter++;
      startComment('comment', commentCounter, markerCommentMatch[1]);
      continue;
    }

    // === Fallback ===
    if (trimmed === '댓글') continue;

    const numberedMatch = trimmed.match(/^(\d+)[.\s]\s*(.+)$/);
    if (numberedMatch) {
      commentCounter++;
      startComment('comment', parseInt(numberedMatch[1]), numberedMatch[2]);
      continue;
    }

    // 태그 아닌 줄 → 현재 댓글에 이어붙이기
    if (current) {
      current.contentLines.push(trimmed);
    }
  }

  finalizeCurrent();

  return results.map((c) => ({ ...c, content: stripMarkdown(c.content) }));
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

  if (!content.body || content.body.length === 0) {
    errors.push('본문이 비어있음');
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
