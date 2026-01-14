const BASE_URL = process.env.COMMENT_GEN_API_URL || 'http://localhost:8000';

interface GenerateCommentRequest {
  content: string;
  author_name?: string;
  persona_index?: number | null;
}

interface GenerateReplyRequest {
  parent_comment: string;
  content?: string;
  author_name?: string;
  parent_author?: string;
  persona_index?: number | null;
}

interface GenerateCommentResponse {
  success: boolean;
  comment: string;
  persona: string;
  model: string;
  elapsed: number;
}

// 댓글 생성 (제3자 입장)
export const generateComment = async (
  postContent: string,
  personaIndex?: number | null,
  authorName?: string
): Promise<string> => {
  const body: GenerateCommentRequest = {
    content: postContent,
    author_name: authorName,
    persona_index: personaIndex ?? null,
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

// 대댓글 생성 (제3자 입장 - 원댓글 작성자에게 답글)
export const generateReply = async (
  postContent: string,
  parentComment: string,
  personaIndex?: number | null,
  authorName?: string,
  parentAuthor?: string
): Promise<string> => {
  const body: GenerateReplyRequest = {
    parent_comment: parentComment,
    content: postContent,
    author_name: authorName,
    parent_author: parentAuthor,
    persona_index: personaIndex ?? null,
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

// 글쓴이 대댓글 생성 (글쓴이가 댓글에 답글)
export const generateAuthorReply = async (
  postContent: string,
  parentComment: string,
  personaIndex?: number | null,
  parentAuthor?: string
): Promise<string> => {
  // 글쓴이는 긍정적 페르소나(0~4) 중 랜덤 또는 지정값 사용
  const authorPersona = personaIndex ?? Math.floor(Math.random() * 5);

  const body: GenerateReplyRequest = {
    parent_comment: parentComment,
    content: postContent,
    parent_author: parentAuthor,
    persona_index: authorPersona,
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
