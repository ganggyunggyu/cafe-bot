import { getRedisConnection } from '../redis';
import { createSequenceController, type SequenceRedisLike } from './sequence-harness';

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const sequenceController = createSequenceController({
  getRedisConnection: () => getRedisConnection() as unknown as SequenceRedisLike,
  log: (message: string) => console.log(message),
  now: () => Date.now(),
  sleep,
});

export const waitForSequenceTurn = sequenceController.waitForSequenceTurn;
export const advanceSequence = sequenceController.advanceSequence;
export { createSequenceController };
