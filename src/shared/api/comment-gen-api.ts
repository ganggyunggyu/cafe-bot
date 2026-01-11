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

interface GenerateReplyRequest {
  content: string;
  parent_comment?: string;
  persona_index?: number | null;
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
  const body: GenerateReplyRequest = {
    content: `글 내용:\n${postContent}\n\n연결된 댓글:\n${parentComment}`,
    persona_index: personaIndex ?? null,
  };

  const res = await fetch(`${BASE_URL}/generate/comment`, {
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

// 글쓴이 대댓글 생성 (감사/친근한 톤)
export const generateAuthorReply = async (
  postContent: string,
  parentComment: string
): Promise<string> => {
  const body: GenerateReplyRequest = {
    content: `[글쓴이 답글 작성]\n\n글 내용:\n${postContent}\n\n받은 댓글:\n${parentComment}\n\n지시사항: 글쓴이로서 댓글에 감사하거나 친근하게 답글을 작성해줘. 1-2문장으로 짧게.`,
    persona_index: null,
  };

  const res = await fetch(`${BASE_URL}/generate/comment`, {
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
