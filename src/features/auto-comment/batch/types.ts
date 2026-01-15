import type { NaverAccount } from '@/shared/lib/account-manager';

export interface BatchJobInput {
  service: string;
  keywords: string[];
  ref?: string;
  cafeId?: string;
  commentTemplates?: string[];
  replyTemplates?: string[];
  postOptions?: PostOptions;
  skipComments?: boolean;
  contentPrompt?: string;
  contentModel?: string;
}

export interface PostResult {
  success: boolean;
  articleId?: number;
  articleUrl?: string;
  writerAccountId: string;
  error?: string;
}

export interface CommentResult {
  accountId: string;
  success: boolean;
  commentIndex: number;
  error?: string;
}

export interface ReplyResult {
  accountId: string;
  success: boolean;
  targetCommentIndex: number;
  isAuthor?: boolean;
  error?: string;
}

export interface KeywordResult {
  keyword: string;
  post: PostResult;
  comments: CommentResult[];
  replies: ReplyResult[];
}

export interface BatchJobResult {
  success: boolean;
  totalKeywords: number;
  completed: number;
  failed: number;
  results: KeywordResult[];
  jobLogId?: string;
}

export interface PostOptions {
  allowComment: boolean;
  allowScrap: boolean;
  allowCopy: boolean;
  useAutoSource: boolean;
  useCcl: boolean;
  cclCommercial: 'allow' | 'disallow';
  cclModify: 'allow' | 'same' | 'disallow';
}

export const DEFAULT_POST_OPTIONS: PostOptions = {
  allowComment: true,
  allowScrap: true,
  allowCopy: false,
  useAutoSource: false,
  useCcl: false,
  cclCommercial: 'disallow',
  cclModify: 'disallow',
};

export interface DelayConfig {
  afterPost: number;
  betweenComments: number;
  beforeReplies: number;
  betweenReplies: number;
  betweenKeywords: number;
}

export const DEFAULT_DELAYS: DelayConfig = {
  afterPost: 5000,
  betweenComments: 4000,
  beforeReplies: 10000,
  betweenReplies: 4000,
  betweenKeywords: 30000,
};

export type ReplyStrategy = 'rotation' | 'random' | 'all-to-first';

export interface BatchJobOptions {
  delays?: Partial<DelayConfig>;
  replyStrategy?: ReplyStrategy;
}

export interface BatchProgress {
  currentKeyword: string;
  keywordIndex: number;
  totalKeywords: number;
  phase: 'post' | 'comments' | 'replies' | 'waiting';
  message: string;
}

export type ProgressCallback = (progress: BatchProgress) => void;

const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const getWriterAccount = (
  accounts: NaverAccount[],
  _keywordIndex: number
): NaverAccount => {
  const randomIndex = Math.floor(Math.random() * accounts.length);
  return accounts[randomIndex];
};

export const getCommenterAccounts = (
  accounts: NaverAccount[],
  writerAccountId: string
): NaverAccount[] => {
  const commenters = accounts.filter((a) => a.id !== writerAccountId);
  return shuffleArray(commenters);
};
