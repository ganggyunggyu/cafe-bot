'use client';

import { atom } from 'jotai';
import type { CafeConfig } from '@/entities/cafe';

// 카페 목록
export const cafesAtom = atom<CafeConfig[]>([]);

// 선택된 카페 ID
export const selectedCafeIdAtom = atom<string>('');

// 로딩 상태
export const cafesLoadingAtom = atom<boolean>(false);

// 초기화 완료 여부
export const cafesInitializedAtom = atom<boolean>(false);

// 선택된 카페 객체 (derived atom)
export const selectedCafeAtom = atom((get) => {
  const cafes = get(cafesAtom);
  const selectedId = get(selectedCafeIdAtom);
  return cafes.find((c) => c.cafeId === selectedId) || null;
});
