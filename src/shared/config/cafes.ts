// 카페 설정 인터페이스
export interface CafeConfig {
  cafeId: string;
  menuId: string;
  name: string;
  categories: string[]; // 카테고리(게시판) 목록
  isDefault?: boolean;
  categoryMenuIds?: Record<string, string>; // 카테고리 → menuId 매핑
}

// 카페 목록 (첫 번째가 기본 카페)
export const CAFE_LIST: CafeConfig[] = [
  {
    cafeId: '31640041',
    menuId: '1',
    name: '으스스',
    categories: ['자유게시판', '일상', '괴담', '광고'],
    isDefault: true,
  },
  // 추가 카페 예시:
  {
    cafeId: '31642514',
    menuId: '1',
    name: '벤타쿠',
    categories: [
      '자유게시판',
      '밴드 뉴스',
      '공연/라이브',
      '가사/번역',
      '앨범/굿즈',
      '직관 후기',
      '악기/연주',
      '중고장터',
      '구매대행',
    ],
  },
];

// 기본 카페 가져오기
export const getDefaultCafe = (): CafeConfig | undefined => {
  return CAFE_LIST.find((c) => c.isDefault) || CAFE_LIST[0];
};

// 카페 ID로 찾기
export const getCafeById = (cafeId: string): CafeConfig | undefined => {
  return CAFE_LIST.find((c) => c.cafeId === cafeId);
};

// 전체 카페 목록
export const getAllCafes = (): CafeConfig[] => {
  return CAFE_LIST.filter((c) => c.cafeId && c.menuId);
};
