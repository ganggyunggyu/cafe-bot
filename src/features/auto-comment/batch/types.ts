import type { NaverAccount } from '@/shared/lib/account-manager';

// 배치 작업 입력
export interface BatchJobInput {
  service: string;
  keywords: string[];
  ref?: string;
  commentTemplates?: string[];
  replyTemplates?: string[];
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
