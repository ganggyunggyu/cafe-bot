import type { PostOptions } from '@/features/auto-comment/batch/types';

export interface ViralCommentItem {
  type: 'comment' | 'author_reply' | 'commenter_reply' | 'other_reply';
  content: string;
  index: number;
  parentIndex?: number;
}

export interface ViralCommentsData {
  comments: ViralCommentItem[];
}

export interface PostJobData {
  type: 'post';
  accountId: string;
  cafeId: string;
  menuId: string;
  subject: string;
  content: string;
  category?: string;
  postOptions?: PostOptions;
  keyword?: string;
  service?: string;
  rawContent?: string;
  skipComments?: boolean;
  viralComments?: ViralCommentsData;
  images?: string[]; // Base64 이미지 배열
  commenterAccountIds?: string[]; // 댓글 작성 계정 ID 목록
  rescheduleToken?: string;
  _retryCount?: number;
}

export interface CommentJobData {
  type: 'comment';
  accountId: string;
  cafeId: string;
  articleId: number;
  content: string;
  commentIndex?: number;
  keyword?: string;
  sequenceId?: string;
  sequenceIndex?: number;
  rescheduleToken?: string;
  _retryCount?: number;
}

export interface ReplyJobData {
  type: 'reply';
  accountId: string;
  cafeId: string;
  articleId: number;
  content: string;
  commentIndex: number;
  parentCommentId?: string;
  parentComment?: string;
  parentNickname?: string;
  keyword?: string;
  sequenceId?: string;
  sequenceIndex?: number;
  rescheduleToken?: string;
  _retryCount?: number;
}

export interface GenerateJobData {
  type: 'generate';
  keyword: string;
  cafeId: string;
  menuId: string;
  accountId: string;
}

export type TaskJobData = PostJobData | CommentJobData | ReplyJobData;

export interface JobResult {
  success: boolean;
  error?: string;
  articleId?: number;
  articleUrl?: string;
  willRetry?: boolean;
}

export const getTaskQueueName = (accountId: string): string => {
  const safeId = accountId.replace(/[^a-zA-Z0-9]/g, '_');
  return `task_${safeId}`;
};

export const GENERATE_QUEUE_NAME = 'generate';
