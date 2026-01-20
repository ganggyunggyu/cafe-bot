import type { PostOptions } from '@/features/auto-comment/batch/types';

export interface ManuscriptFile {
  name: string;
  content: string;
  type: 'text' | 'image';
  base64?: string;
}

export interface ManuscriptFolder {
  folderName: string;
  title: string;
  body: string;
  htmlContent: string;
  images: string[]; // Base64 이미지 배열
  category?: string;
}

export interface ManualPublishInput {
  manuscripts: ManuscriptFolder[];
  cafeId?: string;
  postOptions?: PostOptions;
}

export interface ManualModifyInput {
  manuscripts: ManuscriptFolder[];
  cafeId?: string;
  daysLimit?: number;
  sortOrder?: 'oldest' | 'newest' | 'random';
}

export interface ManualPublishResult {
  success: boolean;
  totalManuscripts: number;
  completed: number;
  failed: number;
  results: ManuscriptResult[];
}

export interface ManuscriptResult {
  folderName: string;
  title: string;
  success: boolean;
  articleId?: number;
  articleUrl?: string;
  error?: string;
}

export interface ManualModifyResult {
  success: boolean;
  totalManuscripts: number;
  completed: number;
  failed: number;
  results: ManuscriptModifyResult[];
  jobLogId?: string;
}

export interface ManuscriptModifyResult {
  folderName: string;
  originalArticleId: number;
  newTitle: string;
  success: boolean;
  error?: string;
}

export const parseManuscriptText = (
  text: string
): { title: string; body: string } => {
  const lines = text.trim().split('\n');
  const title = lines[0]?.trim() || '제목 없음';
  const body = lines.slice(1).join('\n').trim();
  return { title, body };
};

export const convertBodyToHtml = (text: string): string => {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') {
        return '<p><br></p>';
      }
      return `<p>${line}</p>`;
    })
    .join('');
};
