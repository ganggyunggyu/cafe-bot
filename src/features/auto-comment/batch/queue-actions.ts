// Re-export from entities/queue for backward compatibility
export type {
  AllQueueStatus,
  JobDetail,
  JobsPage,
  JobsFilter,
  QueueSummary,
} from '@/entities/queue';

export {
  getAllQueueStatus,
  clearAccountQueue,
  clearAllQueues,
  getDetailedJobs,
  getQueueSummary,
} from '@/entities/queue';
