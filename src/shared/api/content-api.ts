import type { GenerateContentRequest, GenerateContentResponse } from '@/shared/types';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

export const generateContent = async (
  request: GenerateContentRequest
): Promise<GenerateContentResponse> => {
  const response = await fetch(`${CONTENT_API_URL}/generate/gemini-cafe-daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service: request.service,
      keyword: request.keyword,
      ref: request.ref || '',
      persona_id: request.personaId ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Content generation failed: ${response.status}`);
  }

  return response.json();
}

interface GenerateContentWithPromptRequest {
  prompt: string;
  model?: string;
}

interface GenerateContentWithPromptResponse {
  success?: boolean;
  content?: string;
  model?: string;
  elapsed?: number;
}

export const generateContentWithPrompt = async (
  request: GenerateContentWithPromptRequest
): Promise<GenerateContentWithPromptResponse> => {
  const response = await fetch(`${CONTENT_API_URL}/generate/test/cafe-daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: request.prompt,
      model: request.model,
    }),
  });

  if (!response.ok) {
    throw new Error(`Prompted content generation failed: ${response.status}`);
  }

  return response.json();
};

interface ViralContentRequest {
  prompt: string;
  service?: string;
}

interface ViralContentResponse {
  _id?: string;
  content: string;
  createdAt?: string;
  engine?: string;
  service?: string;
  category?: string;
  keyword?: string;
  ref?: string;
}

export const generateViralContent = async (
  request: ViralContentRequest
): Promise<ViralContentResponse> => {
  const response = await fetch(`${CONTENT_API_URL}/generate/gemini-3-flash-clean`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service: request.service || 'viral',
      keyword: request.prompt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Viral content generation failed: ${response.status}`);
  }

  return response.json();
};
