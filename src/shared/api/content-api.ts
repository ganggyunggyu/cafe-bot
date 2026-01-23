import type {
  GenerateContentRequest,
  GenerateContentResponse,
} from '@/shared/types';

const CONTENT_API_URL = process.env.CONTENT_API_URL || 'http://localhost:8000';

export const generateContent = async (
  request: GenerateContentRequest
): Promise<GenerateContentResponse> => {
  const response = await fetch(
    `${CONTENT_API_URL}/generate/gemini-cafe-daily`,
    {
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
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[CONTENT API] 에러 응답:', response.status, errorBody);
    throw new Error(
      `Content generation failed: ${response.status} - ${errorBody}`
    );
  }

  return response.json();
};

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
  ref?: string;
  model?: string;
}

interface ViralContentResponse {
  content: string;
  keyword?: string;
  model?: string;
  char_count?: number;
  elapsed?: number;
}

export const generateViralContent = async (
  request: ViralContentRequest
): Promise<ViralContentResponse> => {
  const response = await fetch(
    `${CONTENT_API_URL}/generate/cafe-total`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword: request.prompt,
        ref: request.ref || '',
        model: request.model,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[VIRAL API] 에러 응답:', response.status, errorBody);
    throw new Error(`Viral content generation failed: ${response.status}`);
  }

  return response.json();
};

// 이미지 생성 API
interface ImageGenerateRequest {
  keyword: string;
  category?: string;
  count?: number;
}

interface ImageGenerateResponse {
  success: boolean;
  images?: string[]; // Base64 또는 URL 배열
  error?: string;
}

// URL에서 이미지를 다운로드하여 base64로 변환
const downloadImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[IMAGE API] 이미지 다운로드 실패:', url, response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    // MIME 타입 추정 (URL 확장자 기반)
    const ext = url.split('.').pop()?.toLowerCase() || 'png';
    const mimeType =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('[IMAGE API] 이미지 다운로드 오류:', url, error);
    return null;
  }
};

export const generateImages = async (
  request: ImageGenerateRequest
): Promise<ImageGenerateResponse> => {
  const response = await fetch(`${CONTENT_API_URL}/generate/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      keyword: request.keyword,
      category: request.category || '',
      count: request.count || 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[IMAGE API] 이미지 생성 실패:', response.status, errorText);
    return { success: false, error: `이미지 생성 실패: ${response.status}` };
  }

  const data = await response.json();
  const rawImages = data.images || [];

  // URL만 추출 (base64로 변환하지 않음 - Job 크기 제한 때문)
  const imageUrls: string[] = [];
  for (const img of rawImages) {
    if (typeof img === 'object' && img !== null && 'url' in img) {
      imageUrls.push((img as { url: string }).url);
      console.log(`[IMAGE API] 이미지 URL: ${(img as { url: string }).url}`);
    } else if (typeof img === 'string' && img.startsWith('http')) {
      imageUrls.push(img);
      console.log(`[IMAGE API] 이미지 URL: ${img}`);
    }
  }

  return {
    success: imageUrls.length > 0,
    images: imageUrls, // URL 반환 (base64 아님)
    error: imageUrls.length === 0 ? '이미지 URL 추출 실패' : undefined,
  };
};

// 이미지 URL을 다운로드하여 base64로 변환 (업로드 시점에 사용)
export { downloadImageAsBase64 };

// Google 검색 이미지 API는 google-image-api.ts로 분리됨
export { searchRandomImages } from './google-image-api';
