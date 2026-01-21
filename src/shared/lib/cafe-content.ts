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

// 단락을 HTML로 변환
const paragraphToHtml = (paragraph: string): string => {
  return paragraph
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : `<p>${line}</p>`))
    .join('');
};

// 이미지를 HTML로 변환
const imageToHtml = (img: ManuscriptImage): string => {
  return `<p><img src="${img.dataUrl}" alt="${img.name}" style="max-width:100%;" /></p>`;
};

// 원고 업로드용 (이미지 포함, 단락 기준 분산 배치)
export const buildCafePostContentFromManuscript = (
  rawContent: string,
  fallbackTitle: string,
  images: ManuscriptImage[] = []
): CafePostContent => {
  const lines = rawContent.split('\n');
  const firstLine = lines[0] ?? '';
  const title = firstLine.replace(/^#\s*/, '').trim() || fallbackTitle;
  const body = lines.slice(1).join('\n').trim();

  // 이미지가 없으면 기존 로직
  if (images.length === 0) {
    const htmlContent = body
      .split('\n')
      .map((line) => (line.trim() === '' ? '<br>' : `<p>${line}</p>`))
      .join('');
    return { title, htmlContent };
  }

  // 단락 분리 (빈 줄 2개 이상으로 구분)
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim() !== '');

  // 단락이 이미지 수보다 적으면 기존 방식 (끝에 모두 추가)
  if (paragraphs.length <= images.length) {
    let htmlContent = paragraphs.map(paragraphToHtml).join('<br>');
    htmlContent += '<br>';
    for (const img of images) {
      htmlContent += imageToHtml(img);
    }
    return { title, htmlContent };
  }

  // 이미지를 단락 사이에 균등 분산 배치
  const imageCount = images.length;
  const paragraphCount = paragraphs.length;
  const interval = Math.floor(paragraphCount / imageCount);

  let htmlContent = '';
  let imageIndex = 0;

  for (let i = 0; i < paragraphCount; i++) {
    htmlContent += paragraphToHtml(paragraphs[i]);

    // 마지막 이미지는 본문 끝에
    if (imageIndex < imageCount - 1) {
      const insertPoint = (imageIndex + 1) * interval - 1;
      if (i === insertPoint) {
        htmlContent += '<br>' + imageToHtml(images[imageIndex]) + '<br>';
        imageIndex++;
      }
    }

    if (i < paragraphCount - 1) {
      htmlContent += '<br>';
    }
  }

  // 마지막 이미지는 본문 끝에 추가
  if (imageIndex < imageCount) {
    htmlContent += '<br>';
    for (let i = imageIndex; i < imageCount; i++) {
      htmlContent += imageToHtml(images[i]);
    }
  }

  return { title, htmlContent };
};
