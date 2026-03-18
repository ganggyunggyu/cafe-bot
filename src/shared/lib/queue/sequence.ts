import { getRedisConnection } from '../redis';

const SEQUENCE_TTL_SEC = 24 * 60 * 60;
const SEQUENCE_POLL_MS = 2000;
const SEQUENCE_WAIT_LIMIT_MS = 30 * 1000;
const SEQUENCE_STALL_MS = 2 * 60 * 1000; // 2분 정체 시 강제 진행

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getSequenceKey = (sequenceId: string): string => `comment_sequence:${sequenceId}`;
const getSequenceTimeKey = (sequenceId: string): string => `comment_sequence:${sequenceId}:ts`;

export const waitForSequenceTurn = async (
  sequenceId: string,
  sequenceIndex: number,
  maxWaitMs: number = SEQUENCE_WAIT_LIMIT_MS
): Promise<'ready' | 'skipped' | 'pending'> => {
  const redis = getRedisConnection();
  const key = getSequenceKey(sequenceId);
  const timeKey = getSequenceTimeKey(sequenceId);

  const initialized = await redis.set(key, '0', 'EX', SEQUENCE_TTL_SEC, 'NX');
  if (initialized === 'OK') {
    await redis.set(timeKey, Date.now().toString(), 'EX', SEQUENCE_TTL_SEC);
  }

  const startedAt = Date.now();
  let logged = false;

  while (true) {
    const raw = await redis.get(key);
    const current = raw ? Number.parseInt(raw, 10) : 0;

    if (current === sequenceIndex) {
      if (logged) {
        console.log(`[QUEUE] 순서 시작: ${sequenceId} -> ${sequenceIndex}`);
      }
      await redis.set(timeKey, Date.now().toString(), 'EX', SEQUENCE_TTL_SEC);
      await redis.expire(key, SEQUENCE_TTL_SEC);
      return 'ready';
    }

    if (current > sequenceIndex) {
      console.log(`[QUEUE] 순서 스킵: ${sequenceId} 현재=${current}, 대상=${sequenceIndex}`);
      return 'skipped';
    }

    // 스톨 감지: 시퀀스가 2분 이상 정체되면 강제 진행
    const lastTs = await redis.get(timeKey);
    if (lastTs) {
      const stalledMs = Date.now() - parseInt(lastTs, 10);
      if (stalledMs > SEQUENCE_STALL_MS) {
        console.log(
          `[QUEUE] 시퀀스 스톨 감지 (${Math.round(stalledMs / 1000)}초 정체) - 강제 진행: ${sequenceId} ${current} → ${sequenceIndex}`
        );
        await redis.set(key, sequenceIndex.toString(), 'EX', SEQUENCE_TTL_SEC);
        await redis.set(timeKey, Date.now().toString(), 'EX', SEQUENCE_TTL_SEC);
        return 'ready';
      }
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
  const timeKey = getSequenceTimeKey(sequenceId);

  await redis.multi()
    .incr(key)
    .expire(key, SEQUENCE_TTL_SEC)
    .set(timeKey, Date.now().toString(), 'EX', SEQUENCE_TTL_SEC)
    .exec();
};
