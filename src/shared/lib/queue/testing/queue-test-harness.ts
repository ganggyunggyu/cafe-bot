import type { SequenceRedisLike, SequenceRedisMultiLike } from '../sequence-harness';
import type { TaskQueueLike } from '../task-job-harness';
import type { TaskJobData } from '../types';

export interface FakeAddedJob {
  name: TaskJobData['type'];
  data: TaskJobData;
  options: {
    delay: number;
    jobId: string;
  };
}

export const createFakeTaskQueue = () => {
  const states = new Map<string, string>();
  const addedJobs: FakeAddedJob[] = [];

  const queue: TaskQueueLike<FakeAddedJob> = {
    getJob: async (jobId: string) => {
      const state = states.get(jobId);
      if (!state) {
        return null;
      }

      return {
        getState: async () => state,
      };
    },
    add: async (name, data, options) => {
      const job = {
        name,
        data,
        options,
      };

      states.set(options.jobId, 'waiting');
      addedJobs.push(job);
      return job;
    },
  };

  const seedJob = (jobId: string, state: string): void => {
    states.set(jobId, state);
  };

  return {
    addedJobs,
    queue,
    seedJob,
    states,
  };
};

export const createTestClock = (initialNow: number = 0) => {
  let currentNow = initialNow;

  const now = (): number => currentNow;
  const advance = (ms: number): void => {
    currentNow += ms;
  };
  const sleep = async (ms: number): Promise<void> => {
    advance(ms);
  };

  return {
    advance,
    now,
    sleep,
  };
};

export const createFakeSequenceRedis = () => {
  const store = new Map<string, string>();
  const expirations = new Map<string, number>();

  const redis: SequenceRedisLike = {
    set: async (key, value, mode, ttlSec, condition) => {
      if (condition === 'NX' && store.has(key)) {
        return null;
      }

      store.set(key, value);
      if (mode === 'EX' && ttlSec !== undefined) {
        expirations.set(key, ttlSec);
      }

      return 'OK';
    },
    get: async (key) => {
      return store.get(key) ?? null;
    },
    expire: async (key, ttlSec) => {
      if (!store.has(key)) {
        return 0;
      }

      expirations.set(key, ttlSec);
      return 1;
    },
    multi: () => {
      const operations: Array<() => void> = [];

      const multi: SequenceRedisMultiLike = {
        incr: (key) => {
          operations.push(() => {
            const current = Number.parseInt(store.get(key) ?? '0', 10);
            store.set(key, (current + 1).toString());
          });
          return multi;
        },
        expire: (key, ttlSec) => {
          operations.push(() => {
            if (store.has(key)) {
              expirations.set(key, ttlSec);
            }
          });
          return multi;
        },
        set: (key, value, mode, ttlSec) => {
          operations.push(() => {
            store.set(key, value);
            if (mode === 'EX') {
              expirations.set(key, ttlSec);
            }
          });
          return multi;
        },
        exec: async () => {
          operations.forEach((operation) => operation());
          return [];
        },
      };

      return multi;
    },
  };

  return {
    expirations,
    redis,
    store,
  };
};
