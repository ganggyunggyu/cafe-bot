import type { ManuscriptImage } from '@/features/auto-comment/publish/types';

export interface CafePostContent {
  title: string;
  htmlContent: string;
}

export const buildCafePostContent = (rawContent: string, fallbackTitle: string): CafePostContent => {
  const lines = rawContent.split('\n');
  const firstLine = lines[0] ?? '';
  const title = firstLine.replace(/^#\s*/, '').trim() || fallbackTitle;
  const body = lines.slice(1).join('\n').trim();

  const htmlContent = body
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : line))
    .join('<br>');

  return { title, htmlContent };
};

// 원고 업로드용 (이미지 포함)
export const buildCafePostContentFromManuscript = (
  rawContent: string,
  fallbackTitle: string,
  images: ManuscriptImage[] = []
): CafePostContent => {
  const lines = rawContent.split('\n');
  const firstLine = lines[0] ?? '';
  const title = firstLine.replace(/^#\s*/, '').trim() || fallbackTitle;
  const body = lines.slice(1).join('\n').trim();

  // 텍스트를 HTML로 변환
  let htmlContent = body
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : `<p>${line}</p>`))
    .join('');

  // 이미지 삽입 (본문 끝에 추가)
  if (images.length > 0) {
    htmlContent += '<br>';
    for (const img of images) {
      htmlContent += `<p><img src="${img.dataUrl}" alt="${img.name}" style="max-width:100%;" /></p>`;
    }
  }

  return { title, htmlContent };
};
