const BASE_URL = process.env.COMMENT_GEN_API_URL || 'http://localhost:8000';

interface GenerateCommentRequest {
  content: string;
  author_name?: string;
  persona_id?: number;
}

interface GenerateReplyRequest {
  parent_comment: string;
  content?: string;
  author_name?: string;
  parent_author?: string;
  commenter_name?: string;
  persona_id?: number;
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
const COMMENT_SAFETY_GUIDE = [
  '',
  '[댓글 말투 지시] 반드시 존댓말만 사용. "~했어", "~같아", "~좋아", "~맞아", "~문제야", "~하자", "~해봐" 같은 반말 종결 금지. "맞아요/저도/오/헐" 시작 반복 금지. 질문형, 경험형, 정보형, 생활잡담형 중 하나로 자연스럽게 작성.',
].join('\n\n');

const withCommentSafetyGuide = (content?: string): string | undefined => {
  if (!content) return COMMENT_SAFETY_GUIDE;
  return `${content}\n\n${COMMENT_SAFETY_GUIDE}`;
};

const toNumericPersonaId = (personaId?: string | null): number | undefined => {
  if (!personaId) return undefined;
  const parsed = Number(personaId);
  if (!Number.isInteger(parsed)) return undefined;
  return parsed;
};

export const generateComment = async (
  postContent: string,
  personaId?: string | null,
  authorName?: string
): Promise<string> => {
  const normalizedPersonaId = toNumericPersonaId(personaId);
  const body: GenerateCommentRequest = {
    content: withCommentSafetyGuide(postContent) ?? postContent,
    author_name: authorName,
  };
  if (normalizedPersonaId !== undefined) body.persona_id = normalizedPersonaId;

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

  return data.comment.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

export const generateReply = async (
  postContent: string,
  parentComment: string,
  personaId?: string | null,
  authorName?: string,
  parentAuthor?: string,
  commenterName?: string
): Promise<string> => {
  const normalizedPersonaId = toNumericPersonaId(personaId);
  const body: GenerateReplyRequest = {
    parent_comment: parentComment,
    content: withCommentSafetyGuide(postContent),
    author_name: authorName,
    parent_author: parentAuthor,
    commenter_name: commenterName,
  };
  if (normalizedPersonaId !== undefined) body.persona_id = normalizedPersonaId;

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

  return data.comment.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

export const generateAuthorReply = async (
  postContent: string,
  parentComment: string,
  personaId?: string | null,
  parentAuthor?: string,
  commenterName?: string
): Promise<string> => {
  const authorPersonaId = personaId ?? POSITIVE_PERSONA_IDS[Math.floor(Math.random() * POSITIVE_PERSONA_IDS.length)];
  const normalizedPersonaId = toNumericPersonaId(authorPersonaId);

  const body: GenerateReplyRequest = {
    parent_comment: parentComment,
    content: withCommentSafetyGuide(postContent),
    parent_author: parentAuthor,
    commenter_name: commenterName,
  };
  if (normalizedPersonaId !== undefined) body.persona_id = normalizedPersonaId;

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

  return data.comment.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
};
