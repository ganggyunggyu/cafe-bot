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

const COMMENT_PATTERNS = {
  comment: /^댓글(\d+)\s+(.+)$/,
  authorReply: /^☆댓글(\d+)\s+(.+)$/,
  commenterReply: /^★댓글(\d+)\s+(.+)$/,
  otherReply: /^○댓글(\d+)\s+(.+)$/,
};

export const parseViralResponse = (
  response: string
): ParsedViralContent | null => {
  try {
    const titleMatch = response.match(/\[제목\]\s*\n(.+?)(?=\n\n|\n\[)/s);
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

const parseComments = (raw: string): ParsedComment[] => {
  const lines = raw.split('\n').filter((line) => line.trim());
  const results: ParsedComment[] = [];
  let commentCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();

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
