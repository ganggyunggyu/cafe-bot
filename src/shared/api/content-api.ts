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
    }),
  });

  if (!response.ok) {
    throw new Error(`Content generation failed: ${response.status}`);
  }

  return response.json();
}
