'use client';

import { atom } from 'jotai';

export interface UserState {
  userId: string;
  displayName: string;
}

// 유저 상태 atom (라우팅해도 유지됨)
export const userAtom = atom<UserState | null>(null);

// 로딩 상태 - 최초 1회만 true
export const userLoadingAtom = atom<boolean>(true);

// 초기화 완료 여부 (중복 fetch 방지)
export const userInitializedAtom = atom<boolean>(false);
