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

[브랜드 철학]
순위보다 근거로 증명합니다.
소음인을 위한 원료배합.
수십 번 테스트 검증 실험을 통해 흡수율·지속성을 확인.

[핵심 수치]
- 국내산 원료 100% (흑염소·홍삼·영지·동충하초 전량 국산)
- 흑염소 원물 11% 균형 설계 (이상적 비율)
- 70mL / 15kcal
- 110℃에서 36시간 저온 추출
- 11단계 제조공정

[5가지 기준]
Point 1: 원료 - 국내산 자연방목 흑염소, 질이 좋은 육골 선별
Point 2: 사육 - 목장용지 보유 환경, 홍삼박·늙은호박 급여
Point 3: 함량 설계 - 함량보다 균형, 체질과 섭취 목적에 맞는 적정 설계
Point 4: 배합 - 원료의 성질을 이해하고 흐트러지지 않게 맞추는 일
Point 5: 공정 - 저온 추출, 흡수 구조까지 고려한 제조 설계

[주원료]
- 자연방목 흑염소: 깊고 진한 풍미의 프리미엄 원료, 육골까지 통째로 사용
- 국내산 6년근 홍삼: 유효 성분이 풍부한 핵심 재료

[부원료]
영지버섯, 동충하초, 대추, 벌꿀, 홍삼박, 늙은호박

[시너지 효과]
홍삼박·늙은호박을 먹고 자란 흑염소에 6년근 홍삼, 영지버섯, 동충하초를 더함.
키우는 과정에서 기본을 만들고, 담아내는 과정에서 완성도를 더함.

[흑염소 사육 특징]
- 목장용지를 보유한 환경에서 자연방목
- 스트레스를 줄이기 위한 넓은 들판
- 홍삼박과 늙은호박을 먹이로 급여
- 사람에게 좋은 재료를 흑염소에게 먼저 먹임

[농도 차이 - 일반 vs 한려담원]
일반 추출물형: 흑염소 추출물 97% + 원물 3%, 묽음, 옅은 갈색, 가벼움
한려담원: 흑염소 원물 11%, 점도 있음, 짙은 갈색, 진함

[제조 설계]
- 저온 추출 선택: 고온에서는 단백질과 유효 성분의 균형이 깨지기 쉬움
- 흑염소와 홍삼의 조합: 단일 원료보다 영양 성분의 활용도를 높이는 방향
- 추출 방식에 머물지 않고 흡수 구조까지 고려

[11단계 제조공정]
원료 입고 → 원료 확인 → 세척 → 손질·선별 → 계량·배합 → 추출 → 여과 → 살균 → 냉각 → 충진·포장 → 보관·출고

[인증]
- HACCP 안전관리인증 (작업장·염소·농장)
- HACCP 인증 도축장
- 도축검사증명서
- 품질검사 성적서
- 모든 시험·검증 결과 적합 판정

[소음인 체질 원료]
계피, 당귀, 생강, 대추, 감초, 황기, 백작약, 진피, 홍삼, 마늘, 두충, 익모초, 쑥, 둥굴레

[추천 대상]
- 몸이 차고 쉽게 피로해지는 소음인 체질
- 기력 관리가 필요한 부모님
- 예전 같지 않은 몸 상태를 느끼는 중장년층
- 야근과 회식으로 쉽게 지치는 직장인
- 체력과 집중력 관리가 필요한 수험생
- 몸을 따뜻하게 관리하고 싶은 분
- 출산 후 회복 관리가 필요한 산모

[섭취 방법]
- 하루 1~2포, 1회 1포
- 개봉 후 그대로 또는 미온수와 함께
- 공복: 빠른 흡수 / 식후: 속 예민한 경우 부담 완화
- 아침: 하루 컨디션 관리 / 저녁: 활동 후 회복 관리

[환불 정책]
한 달 섭취 후 만족하지 않으면 100% 환불.
구매일 기준 한 달 이내 전액 환불 약속.

[브랜드 스토리]
韓 蘭 咲 遠 (한려담원)
매일 먹을 수 있는 보양, 정성과 자연을 담다.
하루를 버티며 쌓여가는 피로 속에서 누군가의 일상을 다시 일으켜 주고 싶은 마음에서 시작.
오랜 시간 정직하게 우려낸 힘, 정성으로 고아낸 농도에 자연의 결을 더함.

[구매 전 확인 기준]
✓ 나의 몸 상태를 기준으로 설계된 배합인가
✓ 오랫동안 꾸준히 먹을 수 있는 맛인가
✓ 국내산 흑염소 원료와 육골을 사용했는가
✓ 흑염소 특유의 누린내를 줄이기 위한 공정이 있는가
✓ 사육부터 공급, 생산까지 관리되는 구조인가
✓ 인증된 제조시설에서 생산되는가`,
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
