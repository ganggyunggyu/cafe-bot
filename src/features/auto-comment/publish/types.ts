// 글만 발행 입력
export interface PostOnlyInput {
  keywords: string[];
  ref?: string;
  cafeId?: string;
  postOptions?: import('../batch/types').PostOptions;
}

// 글만 발행 결과
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

// 댓글만 달기 필터
export interface CommentOnlyFilter {
  cafeId: string;
  minDaysOld: number;
  maxComments: number;
  articleCount: number;
}

// 댓글 대상 글
export interface CommentTargetArticle {
  articleId: number;
  cafeId: string;
  keyword: string;
  title: string;
  publishedAt: Date;
  commentCount: number;
  writerAccountId: string;
}

// 댓글 달기 결과
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

// 원고 업로드
export interface ManuscriptFolder {
  name: string;           // 폴더명 (원고1)
  category?: string;      // 카테고리 (일상) - 폴더명에서 _ 뒤 추출
  content: string;        // 원고.txt 내용
  images: ManuscriptImage[];
}

export interface ManuscriptImage {
  name: string;
  dataUrl: string;        // base64 data URL
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
