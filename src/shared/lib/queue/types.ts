import type { PostOptions } from '@/features/auto-comment/batch/types';

// 글 작성 Job
export interface PostJobData {
  type: 'post';
  accountId: string;
  cafeId: string;
  menuId: string;
  subject: string;
  content: string;
  category?: string;
  postOptions?: PostOptions;
  keyword?: string; // 추적용
  service?: string; // 댓글 생성용
  rawContent?: string; // AI 생성 원본 콘텐츠 (댓글 생성용)
  skipComments?: boolean; // true면 댓글/대댓글 스킵 (글만 발행)
}

// 댓글 작성 Job
export interface CommentJobData {
  type: 'comment';
  accountId: string;
  cafeId: string;
  articleId: number;
  content: string;
}

// 대댓글 작성 Job
export interface ReplyJobData {
  type: 'reply';
  accountId: string;
  cafeId: string;
  articleId: number;
  content: string;
  commentIndex: number;
}

// AI 콘텐츠 생성 Job
export interface GenerateJobData {
  type: 'generate';
  keyword: string;
  cafeId: string;
  menuId: string;
  accountId: string; // 작성할 계정
}

// 통합 Task Job (계정별 큐에서 처리)
export type TaskJobData = PostJobData | CommentJobData | ReplyJobData;

// Job 결과
export interface JobResult {
  success: boolean;
  error?: string;
  articleId?: number;
  articleUrl?: string;
  willRetry?: boolean; // 5분 뒤 재시도 예정 여부
}

// 큐 이름 생성
export const getTaskQueueName = (accountId: string): string => {
  const safeId = accountId.replace(/[^a-zA-Z0-9]/g, '_');
  return `task_${safeId}`;
};

export const GENERATE_QUEUE_NAME = 'generate';
