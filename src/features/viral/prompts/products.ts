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
    details: `한려담원 흑염소진액 상세 정보
[제품 스펙]
- 제품명: 한려담원 흑염소 진액
- 흑염소 원물: 국내산 11%
- 1포: 70mL / 5kcal
- 원료: 지리산 8만평 규모 농장에서 자연방목으로 사육한 국내산 흑염소
- 제조: 105℃ 48시간 저온 추출 + 누린내 저감을 위한 기름 제거 공정

[원료 기준]
- 주원료: 국내산 자연방목 흑염소 (육골까지 통째로 사용)
- 배합 원재료: 국내산 흑염소, 6년근 유기농홍삼, 영지버섯, 동충하초, 대추, 당귀, 천궁, 감초, 생강, 황기 등
- 자연방목 사육 원료를 사용하는 이유: 사육 환경과 원료 이력을 더 분명하게 확인하고 관리하기 위함

[공정/품질 관리]
- 105℃ 48시간 저온 추출 기준으로 오랜 시간 진하게 우려냄
- 누린내가 부담스럽지 않도록 기름 제거 공정을 포함해 관리
- HACCP 인증 시설에서 제조
- 원재료 이력과 제조 흐름을 기준에 따라 점검
[농도 차이 - 일반 vs 한려담원]
일반 추출물형: 흑염소 추출물 97% + 원물 3%, 묽음, 옅은 갈색, 가벼움
한려담원: 흑염소 원물 11%, 점도 있음, 짙은 갈색, 진함
[섭취 정보]
- 기본 권장량: 하루 1포(70mL)
- 컨디션에 따라: 오전/오후로 나누어 하루 2포까지 조절 가능 (개인차 있음)
- 위가 예민한 경우/어린이: 식후 섭취 또는 소량부터 단계적으로 조절
- 유통기한: 제조일로부터 2년
[추천 대상]
- 기력 관리가 필요한 부모님
- 예전 같지 않은 몸 상태를 느끼는 중장년층
- 야근과 회식으로 쉽게 지치는 직장인
- 몸을 따뜻하게 관리하고 싶은 분
- 출산 후 회복 관리가 필요한 산모
- 체력과 집중력 관리가 필요한 수험생
[운영 정보]
- 배송: 평일 15시 이전 결제 완료 건 당일 출고 원칙
- 택배사: CJ대한통운
- 배송비: 2,500원 / 50,000원 이상 무료배송
[환불 정책]
한 달 섭취 후 불만족 시 100% 전액 환불.

[표현 가이드 - 내부용]
- 특정 체질/특정 질환 전용 제품처럼 안내하지 않기
- 질병 치료/개선, 과장/단정 (특히 "안전", "문제 없음") 표현 금지
- 수면/불면 관련 효능 언급 금지`,

  },
];

export const getRandomProduct = (): ProductInfo => pickRandom(PRODUCTS);

export const getProductByIndex = (index: number): ProductInfo => {
  return PRODUCTS[index % PRODUCTS.length];
};

export const PRODUCT_INFO = PRODUCTS[0];

export const getRandomContentType = (): ContentType => {
  const types: ContentType[] = ['problem', 'review', 'lifestyle'];
  const weights = [0.4, 0.35, 0.25];
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
