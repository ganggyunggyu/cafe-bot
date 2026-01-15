/**
 * 배열에서 랜덤 요소 선택
 */
export const pickRandom = <T>(arr: T[]): T => {
  if (arr.length === 0) throw new Error('빈 배열에서 선택할 수 없습니다');
  return arr[Math.floor(Math.random() * arr.length)];
};

/**
 * 배열에서 N개 랜덤 선택 (중복 없음)
 */
export const pickRandomN = <T>(arr: T[], n: number): T[] => {
  if (n > arr.length) throw new Error('배열 길이보다 많이 선택할 수 없습니다');
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
};

/**
 * 배열 셔플
 */
export const shuffle = <T>(arr: T[]): T[] => {
  return [...arr].sort(() => Math.random() - 0.5);
};

/**
 * 가중치 기반 랜덤 선택
 */
export const pickWeighted = <T>(items: T[], weights: number[]): T => {
  if (items.length !== weights.length) throw new Error('아이템과 가중치 길이가 다릅니다');

  const total = weights.reduce((sum, w) => sum + w, 0);
  const random = Math.random() * total;

  let cumulative = 0;
  for (let i = 0; i < items.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) return items[i];
  }

  return items[items.length - 1];
};

/**
 * min~max 사이 랜덤 정수
 */
export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * min~max 사이 랜덤 딜레이 (밀리초)
 */
export const randomDelay = (min: number, max: number): number => {
  return randomInt(min, max);
};
