'use client';

import { atom } from 'jotai';
import type { PostOptions } from '@/features/auto-comment/batch/types';
import { DEFAULT_POST_OPTIONS } from '@/features/auto-comment/batch/types';

// PostOptions 공유 상태 (viral, post-only, manual-post 등에서 사용)
export const postOptionsAtom = atom<PostOptions>(DEFAULT_POST_OPTIONS);

// 개별 필드 파생 atom (필요 시 사용)
export const allowCommentAtom = atom(
  (get) => get(postOptionsAtom).allowComment,
  (get, set, value: boolean) => set(postOptionsAtom, { ...get(postOptionsAtom), allowComment: value })
);

export const allowScrapAtom = atom(
  (get) => get(postOptionsAtom).allowScrap,
  (get, set, value: boolean) => set(postOptionsAtom, { ...get(postOptionsAtom), allowScrap: value })
);

// PostOptions 리셋 액션
export const resetPostOptionsAtom = atom(null, (_get, set) => {
  set(postOptionsAtom, DEFAULT_POST_OPTIONS);
});
