import type { NaverAccount } from '@/shared/lib/account-manager';

// 배치 작업 입력
export interface BatchJobInput {
  service: string;
  keywords: string[];
  ref?: string;
  cafeId?: string; // 카페 ID (미지정 시 기본 카페)
  commentTemplates?: string[];
  replyTemplates?: string[];
  postOptions?: PostOptions;
}

// 글 작성 결과
export interface PostResult {
  success: boolean;
  articleId?: number;
  articleUrl?: string;
  writerAccountId: string;
  error?: string;
}

// 댓글 결과
export interface CommentResult {
  accountId: string;
  success: boolean;
  commentIndex: number;
  error?: string;
}

// 대댓글 결과
export interface ReplyResult {
  accountId: string;
  success: boolean;
  targetCommentIndex: number;
  isAuthor?: boolean; // 글쓴이 대댓글 여부
  error?: string;
}

// 키워드별 결과
export interface KeywordResult {
  keyword: string;
  post: PostResult;
  comments: CommentResult[];
  replies: ReplyResult[];
}

// 전체 배치 결과
export interface BatchJobResult {
  success: boolean;
  totalKeywords: number;
  completed: number;
  failed: number;
  results: KeywordResult[];
  jobLogId?: string;
}

// 게시 옵션
export interface PostOptions {
  allowComment: boolean; // 댓글 허용
  allowScrap: boolean; // 카페·블로그 스크랩 허용
  allowCopy: boolean; // 복사·저장 허용
  useAutoSource: boolean; // 자동출처 사용
  useCcl: boolean; // CCL 사용
  cclCommercial: 'allow' | 'disallow'; // 영리적 이용
  cclModify: 'allow' | 'same' | 'disallow'; // 콘텐츠 변경
}

// 기본 게시 옵션
export const DEFAULT_POST_OPTIONS: PostOptions = {
  allowComment: true,
  allowScrap: true,
  allowCopy: false,
  useAutoSource: false,
  useCcl: false,
  cclCommercial: 'disallow',
  cclModify: 'disallow',
};

// 딜레이 설정
export interface DelayConfig {
  afterPost: number;
  betweenComments: number;
  beforeReplies: number;
  betweenReplies: number;
  betweenKeywords: number;
}

// 기본 딜레이 값 (ms)
export const DEFAULT_DELAYS: DelayConfig = {
  afterPost: 5000,
  betweenComments: 4000,
  beforeReplies: 10000,
  betweenReplies: 4000,
  betweenKeywords: 30000,
};

// 대댓글 전략
export type ReplyStrategy = 'rotation' | 'random' | 'all-to-first';

// 배치 작업 옵션
export interface BatchJobOptions {
  delays?: Partial<DelayConfig>;
  replyStrategy?: ReplyStrategy;
}

// 진행 상황 콜백
export interface BatchProgress {
  currentKeyword: string;
  keywordIndex: number;
  totalKeywords: number;
  phase: 'post' | 'comments' | 'replies' | 'waiting';
  message: string;
}

export type ProgressCallback = (progress: BatchProgress) => void;

// 계정 로테이션 헬퍼
export const getWriterAccount = (
  accounts: NaverAccount[],
  keywordIndex: number
): NaverAccount => {
  return accounts[keywordIndex % accounts.length];
}

export const getCommenterAccounts = (
  accounts: NaverAccount[],
  writerAccountId: string
): NaverAccount[] => {
  return accounts.filter((a) => a.id !== writerAccountId);
}
