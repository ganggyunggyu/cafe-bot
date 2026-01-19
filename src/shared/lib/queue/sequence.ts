import { getRedisConnection } from '../redis';

const SEQUENCE_TTL_SEC = 24 * 60 * 60;
const SEQUENCE_POLL_MS = 2000;
const SEQUENCE_WAIT_LIMIT_MS = 30 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getSequenceKey = (sequenceId: string): string => `comment_sequence:${sequenceId}`;

export const waitForSequenceTurn = async (
  sequenceId: string,
  sequenceIndex: number,
  maxWaitMs: number = SEQUENCE_WAIT_LIMIT_MS
): Promise<'ready' | 'skipped' | 'pending'> => {
  const redis = getRedisConnection();
  const key = getSequenceKey(sequenceId);

  await redis.set(key, '0', 'EX', SEQUENCE_TTL_SEC, 'NX');

  const startedAt = Date.now();
  let logged = false;

  while (true) {
    const raw = await redis.get(key);
    const current = raw ? Number.parseInt(raw, 10) : 0;

    if (current === sequenceIndex) {
      if (logged) {
        console.log(`[QUEUE] 순서 시작: ${sequenceId} -> ${sequenceIndex}`);
      }
      await redis.expire(key, SEQUENCE_TTL_SEC);
      return 'ready';
    }

    if (current > sequenceIndex) {
      console.log(`[QUEUE] 순서 스킵: ${sequenceId} 현재=${current}, 대상=${sequenceIndex}`);
      return 'skipped';
    }

    if (!logged) {
      console.log(`[QUEUE] 순서 대기: ${sequenceId} 현재=${current}, 대상=${sequenceIndex}`);
      logged = true;
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      return 'pending';
    }

    await sleep(SEQUENCE_POLL_MS);
  }
};

export const advanceSequence = async (sequenceId: string): Promise<void> => {
  const redis = getRedisConnection();
  const key = getSequenceKey(sequenceId);

  await redis.multi().incr(key).expire(key, SEQUENCE_TTL_SEC).exec();
};
