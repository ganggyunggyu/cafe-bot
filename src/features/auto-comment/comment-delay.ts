export const COMMENT_DELAY_RANGE_MS = {
  base: 3000,
  jitter: 2000,
} as const;

export const getCommentDelayMs = (): number => {
  return COMMENT_DELAY_RANGE_MS.base + Math.random() * COMMENT_DELAY_RANGE_MS.jitter;
}
