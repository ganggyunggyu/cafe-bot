const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

export interface KeywordGenerateRequest {
  categories: string[];
  count?: number;
  include_keywords?: string[];
  exclude_keywords?: string[];
  shuffle?: boolean;
  note?: string;
}

export interface GeneratedKeyword {
  keyword: string;
  category: string;
}

export interface KeywordGenerateResponse {
  keywords: GeneratedKeyword[];
  count: number;
  model: string;
}

export const generateKeywords = async (
  request: KeywordGenerateRequest
): Promise<KeywordGenerateResponse> => {
  const response = await fetch(`${CONTENT_API_URL}/keyword-generator`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      categories: request.categories,
      count: request.count ?? 60,
      include_keywords: request.include_keywords ?? [],
      exclude_keywords: request.exclude_keywords ?? [],
      shuffle: request.shuffle ?? true,
      note: request.note ?? '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Keyword generation failed: ${response.status}`);
  }

  return response.json();
}
