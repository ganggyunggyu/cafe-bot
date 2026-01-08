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

export async function generateComment(
  postContent: string,
  personaIndex?: number | null
): Promise<string> {
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

export async function generateReply(
  postContent: string,
  parentComment: string,
  personaIndex?: number | null
): Promise<string> {
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
