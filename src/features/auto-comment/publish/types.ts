export interface PostOnlyInput {
  keywords: string[];
  ref?: string;
  cafeId?: string;
  postOptions?: import('../batch/types').PostOptions;
}

export interface PostOnlyResult {
  success: boolean;
  totalKeywords: number;
  completed: number;
  failed: number;
  results: PostOnlyKeywordResult[];
}

export interface PostOnlyKeywordResult {
  keyword: string;
  success: boolean;
  articleId?: number;
  writerAccountId: string;
  error?: string;
}

export interface CommentOnlyFilter {
  cafeId: string;
  minDaysOld: number;
  maxComments: number;
  articleCount: number;
}

export interface CommentTargetArticle {
  articleId: number;
  cafeId: string;
  keyword: string;
  title: string;
  publishedAt: Date;
  commentCount: number;
  writerAccountId: string;
}

export interface CommentOnlyResult {
  success: boolean;
  totalArticles: number;
  completed: number;
  failed: number;
  results: CommentOnlyArticleResult[];
  message?: string;
}

export interface CommentOnlyArticleResult {
  articleId: number;
  keyword: string;
  success: boolean;
  commentsAdded: number;
  error?: string;
}

export interface ManuscriptFolder {
  name: string;
  category?: string;
  content: string;
  images: ManuscriptImage[];
}

export interface ManuscriptImage {
  name: string;
  dataUrl: string;
}

export interface ManuscriptUploadInput {
  manuscripts: ManuscriptFolder[];
  cafeId?: string;
  postOptions?: import('../batch/types').PostOptions;
}

export interface ManuscriptUploadResult {
  success: boolean;
  jobsAdded: number;
  message: string;
}

export type ManuscriptSortOrder = 'oldest' | 'newest' | 'random';

export interface ManuscriptModifyInput {
  manuscripts: ManuscriptFolder[];
  cafeId?: string;
  sortOrder?: ManuscriptSortOrder;
  daysLimit?: number;
}

export interface ManuscriptModifyResult {
  success: boolean;
  totalArticles: number;
  completed: number;
  failed: number;
  results: ManuscriptModifyArticleResult[];
  message: string;
}

export interface ManuscriptModifyArticleResult {
  articleId: number;
  keyword: string;
  manuscriptName: string;
  success: boolean;
  error?: string;
}
