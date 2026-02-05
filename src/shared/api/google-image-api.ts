const GOOGLE_IMAGE_API_URL =
  process.env.GOOGLE_IMAGE_API_URL || 'http://localhost:3939';

interface SearchRandomImagesRequest {
  keyword: string;
  count?: number;
}

interface SearchRandomImagesResponse {
  success: boolean;
  images?: string[];
  error?: string;
}

export const searchRandomImages = async (
  request: SearchRandomImagesRequest
): Promise<SearchRandomImagesResponse> => {
  try {
    const response = await fetch(
      `${GOOGLE_IMAGE_API_URL}/api/image/random-frames`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: request.keyword,
          count: request.count || 5,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[GOOGLE IMAGE API] 검색 이미지 실패:',
        response.status,
        errorText
      );
      return { success: false, error: `검색 이미지 실패: ${response.status}` };
    }

    const data = await response.json();
    const images = data.images || {};
    const imageUrls = [
      ...(images.body || []),
      ...(images.individual || []),
      ...(images.slide || []),
      ...(images.collage || []),
    ].filter((url: string) => typeof url === 'string' && url.startsWith('http'));

    console.log(
      `[GOOGLE IMAGE API] 검색 이미지 ${imageUrls.length}장 완료: ${request.keyword}`
    );

    return {
      success: imageUrls.length > 0,
      images: imageUrls,
      error: imageUrls.length === 0 ? '검색 이미지 없음' : undefined,
    };
  } catch (error) {
    console.error('[GOOGLE IMAGE API] 검색 이미지 오류:', error);
    return { success: false, error: '검색 이미지 요청 실패' };
  }
};
