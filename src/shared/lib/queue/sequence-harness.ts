export type SequenceTurnStatus = 'ready' | 'skipped' | 'pending';

export interface SequenceRedisMultiLike {
  incr: (key: string) => SequenceRedisMultiLike;
  expire: (key: string, ttlSec: number) => SequenceRedisMultiLike;
  set: (key: string, value: string, mode: 'EX', ttlSec: number) => SequenceRedisMultiLike;
  exec: () => Promise<unknown>;
}

export interface SequenceRedisLike {
  set: (
    key: string,
    value: string,
    mode?: 'EX',
    ttlSec?: number,
    condition?: 'NX'
  ) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  expire: (key: string, ttlSec: number) => Promise<unknown>;
  multi: () => SequenceRedisMultiLike;
}

export interface CreateSequenceControllerDeps {
  getRedisConnection: () => SequenceRedisLike;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  ttlSec?: number;
  pollMs?: number;
  waitLimitMs?: number;
  stallMs?: number;
  log?: (message: string) => void;
}

const DEFAULT_SEQUENCE_TTL_SEC = 24 * 60 * 60;
const DEFAULT_SEQUENCE_POLL_MS = 2000;
const DEFAULT_SEQUENCE_WAIT_LIMIT_MS = 30 * 1000;
const DEFAULT_SEQUENCE_STALL_MS = 2 * 60 * 1000;

const getSequenceKey = (sequenceId: string): string => `comment_sequence:${sequenceId}`;
const getSequenceTimeKey = (sequenceId: string): string => `comment_sequence:${sequenceId}:ts`;

export const createSequenceController = ({
  getRedisConnection,
  sleep,
  now,
  ttlSec = DEFAULT_SEQUENCE_TTL_SEC,
  pollMs = DEFAULT_SEQUENCE_POLL_MS,
  waitLimitMs = DEFAULT_SEQUENCE_WAIT_LIMIT_MS,
  stallMs = DEFAULT_SEQUENCE_STALL_MS,
  log = console.log,
}: CreateSequenceControllerDeps) => {
  const waitForSequenceTurn = async (
    sequenceId: string,
    sequenceIndex: number,
    maxWaitMs: number = waitLimitMs
  ): Promise<SequenceTurnStatus> => {
    const redis = getRedisConnection();
    const key = getSequenceKey(sequenceId);
    const timeKey = getSequenceTimeKey(sequenceId);

    const initialized = await redis.set(key, '0', 'EX', ttlSec, 'NX');
    if (initialized === 'OK') {
      await redis.set(timeKey, now().toString(), 'EX', ttlSec);
    }

    const startedAt = now();
    let logged = false;

    while (true) {
      const raw = await redis.get(key);
      const current = raw ? Number.parseInt(raw, 10) : 0;

      if (current === sequenceIndex) {
        if (logged) {
          log(`[QUEUE] 순서 시작: ${sequenceId} -> ${sequenceIndex}`);
        }
        await redis.set(timeKey, now().toString(), 'EX', ttlSec);
        await redis.expire(key, ttlSec);
        return 'ready';
      }

      if (current > sequenceIndex) {
        log(`[QUEUE] 순서 스킵: ${sequenceId} 현재=${current}, 대상=${sequenceIndex}`);
        return 'skipped';
      }

      const lastTs = await redis.get(timeKey);
      if (lastTs) {
        const stalledMs = now() - Number.parseInt(lastTs, 10);
        if (stalledMs > stallMs) {
          log(
            `[QUEUE] 시퀀스 스톨 감지 (${Math.round(stalledMs / 1000)}초 정체) - 강제 진행: ${sequenceId} ${current} → ${sequenceIndex}`
          );
          await redis.set(key, sequenceIndex.toString(), 'EX', ttlSec);
          await redis.set(timeKey, now().toString(), 'EX', ttlSec);
          return 'ready';
        }
      }

      if (!logged) {
        log(`[QUEUE] 순서 대기: ${sequenceId} 현재=${current}, 대상=${sequenceIndex}`);
        logged = true;
      }

      if (now() - startedAt >= maxWaitMs) {
        return 'pending';
      }

      await sleep(pollMs);
    }
  };

  const advanceSequence = async (sequenceId: string): Promise<void> => {
    const redis = getRedisConnection();
    const key = getSequenceKey(sequenceId);
    const timeKey = getSequenceTimeKey(sequenceId);

    await redis.multi().incr(key).expire(key, ttlSec).set(timeKey, now().toString(), 'EX', ttlSec).exec();
  };

  return {
    advanceSequence,
    waitForSequenceTurn,
  };
};
