import { pickRandom, pickWeighted } from '@/shared/lib/random';
import type { ProductInfo, ContentType } from './types';

export const PRODUCTS: ProductInfo[] = [
  {
    name: '한려담원 흑염소진액',
    shortName: '한려담원',
    effects: [
      '기력보충 / 원기회복',
      '피로회복',
      '면역력 향상',
      '손발 따뜻하게 (혈액순환 개선)',
      '허약 체질 개선',
      '체력 증진',
      '갱년기 증상 완화',
      '산후조리 보양',
    ],
  },
  {
    name: '한려담원 녹용진액',
    shortName: '한려담원 녹용',
    effects: [
      '기력보충 / 원기회복',
      '면역력 강화',
      '뼈 건강 개선',
      '성장기 영양 보충',
      '노화 방지',
      '체력 증진',
    ],
  },
  {
    name: '한려담원 홍삼진액',
    shortName: '한려담원 홍삼',
    effects: [
      '면역력 증진',
      '피로회복',
      '혈행 개선',
      '기억력 개선',
      '항산화 작용',
      '체력 증진',
    ],
  },
  {
    name: '한려담원 산양삼진액',
    shortName: '한려담원 산양삼',
    effects: [
      '기력보충 / 원기회복',
      '면역력 강화',
      '피로회복',
      '체력 증진',
      '항산화 작용',
    ],
  },
  {
    name: '한려담원 도라지배즙',
    shortName: '한려담원 도라지',
    effects: [
      '기관지 건강',
      '목 건강',
      '면역력 향상',
      '환절기 건강 관리',
      '호흡기 건강',
    ],
  },
  {
    name: '한려담원 석류진액',
    shortName: '한려담원 석류',
    effects: [
      '여성 건강',
      '갱년기 증상 완화',
      '피부 건강',
      '항산화 작용',
      '호르몬 균형',
    ],
  },
  {
    name: '한려담원 흑마늘진액',
    shortName: '한려담원 흑마늘',
    effects: [
      '면역력 증진',
      '피로회복',
      '항산화 작용',
      '혈행 개선',
      '체력 증진',
    ],
  },
  {
    name: '한려담원 크릴오일',
    shortName: '한려담원 크릴',
    effects: ['혈행 개선', '관절 건강', '눈 건강', '뇌 건강', '오메가3 보충'],
  },
  {
    name: '한려담원 밀크씨슬',
    shortName: '한려담원 밀크씨슬',
    effects: ['간 건강', '피로회복', '해독 작용', '숙취 해소', '간 기능 개선'],
  },
  {
    name: '한려담원 프로폴리스',
    shortName: '한려담원 프로폴리스',
    effects: [
      '면역력 증진',
      '항균 작용',
      '구강 건강',
      '항산화 작용',
      '환절기 건강 관리',
    ],
  },
];

export const getRandomProduct = (): ProductInfo => pickRandom(PRODUCTS);

export const getProductByIndex = (index: number): ProductInfo => {
  return PRODUCTS[index % PRODUCTS.length];
};

// 하위 호환성을 위해 유지
export const PRODUCT_INFO = PRODUCTS[0];

export const getRandomContentType = (): ContentType => {
  const types: ContentType[] = ['problem', 'review', 'lifestyle'];
  const weights = [0.4, 0.35, 0.25]; // 고민형 40%, 후기형 35%, 일상형 25%
  return pickWeighted(types, weights);
};

export const getContentTypeLabel = (type: ContentType): string => {
  switch (type) {
    case 'problem':
      return '고민형';
    case 'review':
      return '후기형';
    case 'lifestyle':
      return '일상형';
  }
};

export const detectKeywordType = (keyword: string): 'own' | 'competitor' => {
  const ownKeywords = [
    '기력보충',
    '원기회복',
    '피로회복',
    '면역력',
    '수족냉증',
    '흑염소',
    '흑염소진액',
    '흑염소즙',
    '보양식',
    '한려담원',
    '갱년기',
    '산후조리',
    '허약체질',
    '체력',
    '혈액순환',
  ];

  const isOwn = ownKeywords.some((own) =>
    keyword.toLowerCase().includes(own.toLowerCase())
  );

  return isOwn ? 'own' : 'competitor';
};
