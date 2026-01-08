import type { CafePostRequest, CafePostResponse } from '@/shared/types';

const NAVER_API_URL = 'https://openapi.naver.com/v1/cafe';

export const postToCafe = async (
  accessToken: string,
  request: CafePostRequest
): Promise<CafePostResponse> => {
  const { clubId, menuId, subject, content, openyn, searchopen, replyyn, scrapyn } = request;

  const url = `${NAVER_API_URL}/${clubId}/menu/${menuId}/articles`;

  const params = new URLSearchParams();
  params.append('subject', encodeURIComponent(subject));
  params.append('content', encodeURIComponent(content));

  if (openyn !== undefined) params.append('openyn', String(openyn));
  if (searchopen !== undefined) params.append('searchopen', String(searchopen));
  if (replyyn !== undefined) params.append('replyyn', String(replyyn));
  if (scrapyn !== undefined) params.append('scrapyn', String(scrapyn));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: params.toString(),
  });

  const data: CafePostResponse = await response.json();

  if (data.message.status !== '200') {
    throw new Error(data.message.error?.msg || 'Unknown error');
  }

  return data;
}

export const joinCafe = async (
  accessToken: string,
  clubId: string,
  nickname: string
): Promise<void> => {
  const url = `${NAVER_API_URL}/${clubId}/members`;

  const params = new URLSearchParams();
  params.append('nickname', nickname);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (data.message.status !== '200') {
    throw new Error(data.message.error?.msg || 'Join failed');
  }
}
