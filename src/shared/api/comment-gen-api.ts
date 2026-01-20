const BASE_URL = process.env.COMMENT_GEN_API_URL || 'http://localhost:8000';

interface GenerateCommentRequest {
  content: string;
  author_name?: string;
  persona_id?: string | null;
}

interface GenerateReplyRequest {
  parent_comment: string;
  content?: string;
  author_name?: string;
  parent_author?: string;
  commenter_name?: string;
  persona_id?: string | null;
}

interface GenerateCommentResponse {
  success: boolean;
  comment: string;
  persona_id: string;
  persona: string;
  model: string;
  elapsed: number;
}

const POSITIVE_PERSONA_IDS = ['cute_f', 'warm_f', 'enthusiast', 'grateful', 'supporter'];

export const generateComment = async (
  postContent: string,
  personaId?: string | null,
  authorName?: string
): Promise<string> => {
  const body: GenerateCommentRequest = {
    content: postContent,
    author_name: authorName,
    persona_id: personaId ?? null,
  };

  const res = await fetch(`${BASE_URL}/generate/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`댓글 생성 API 오류: ${res.status}`);
  }

  const data: GenerateCommentResponse = await res.json();

  if (!data.success) {
    throw new Error('댓글 생성 실패');
  }

  return data.comment;
};

export const generateReply = async (
  postContent: string,
  parentComment: string,
  personaId?: string | null,
  authorName?: string,
  parentAuthor?: string,
  commenterName?: string
): Promise<string> => {
  const body: GenerateReplyRequest = {
    parent_comment: parentComment,
    content: postContent,
    author_name: authorName,
    parent_author: parentAuthor,
    commenter_name: commenterName,
    persona_id: personaId ?? null,
  };

  const res = await fetch(`${BASE_URL}/generate/recomment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`대댓글 생성 API 오류: ${res.status}`);
  }

  const data: GenerateCommentResponse = await res.json();

  if (!data.success) {
    throw new Error('대댓글 생성 실패');
  }

  return data.comment;
};

export const generateAuthorReply = async (
  postContent: string,
  parentComment: string,
  personaId?: string | null,
  parentAuthor?: string,
  commenterName?: string
): Promise<string> => {
  const authorPersonaId = personaId ?? POSITIVE_PERSONA_IDS[Math.floor(Math.random() * POSITIVE_PERSONA_IDS.length)];

  const body: GenerateReplyRequest = {
    parent_comment: parentComment,
    content: postContent,
    parent_author: parentAuthor,
    commenter_name: commenterName,
    persona_id: authorPersonaId,
  };

  const res = await fetch(`${BASE_URL}/generate/recomment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`글쓴이 대댓글 생성 API 오류: ${res.status}`);
  }

  const data: GenerateCommentResponse = await res.json();

  if (!data.success) {
    throw new Error('글쓴이 대댓글 생성 실패');
  }

  return data.comment;
};
