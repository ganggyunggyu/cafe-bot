export const COMMENT_DELAY_RANGE_MS = {
  base: 3 * 60 * 1000,
  jitter: 5 * 60 * 1000,
} as const;

export const getCommentDelayMs = (): number => {
  return COMMENT_DELAY_RANGE_MS.base + Math.random() * COMMENT_DELAY_RANGE_MS.jitter;
}
