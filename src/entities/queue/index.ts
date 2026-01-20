export interface QueueState {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed?: number;
}

export type QueueStatusMap = Record<string, QueueState>;

export interface QueueTotals extends QueueState {
  delayed: number;
}

export interface AccountQueueStatus extends QueueTotals {
  accountId: string;
  queueName: string;
}

export interface QueueOverview {
  queues: AccountQueueStatus[];
  total: QueueTotals;
}

export type QueueStatusResult = QueueStatusMap;
