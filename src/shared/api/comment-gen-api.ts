const BASE_URL = process.env.COMMENT_GEN_API_URL || 'http://localhost:8000';

interface GenerateCommentRequest {
  content: string;
  persona_index?: number | null;
}

interface GenerateCommentResponse {
  success: boolean;
  comment: string;
  persona: string;
  model: string;
  elapsed: number;
}

export const generateComment = async (
  postContent: string,
  personaIndex?: number | null
): Promise<string> => {
  const body: GenerateCommentRequest = {
    content: postContent,
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
}

export const generateReply = async (
  postContent: string,
  parentComment: string,
  personaIndex?: number | null
): Promise<string> => {
  const body = {
    parent_comment: parentComment,
    content: postContent,
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
}

// 글쓴이 대댓글 생성 (감사/친근한 톤 - 긍정 페르소나 사용)
export const generateAuthorReply = async (
  postContent: string,
  parentComment: string,
  personaIndex?: number | null
): Promise<string> => {
  // 글쓴이는 긍정적 페르소나(0~4) 중 랜덤 또는 지정값 사용
  const authorPersona = personaIndex ?? Math.floor(Math.random() * 5); // 0~4

  const body = {
    parent_comment: parentComment,
    content: postContent,
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
}
