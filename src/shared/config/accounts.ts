import type { NaverAccount } from '@/shared/lib/account-manager';

/*
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        계정 설정 가이드                           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ■ 활동 설정
 * ┌──────────────────┬─────────────────────────────────────────────┐
 * │ activityHours    │ { start: 9, end: 22 } → 오전 9시~오후 10시    │
 * │ restDays         │ [0, 6] → 일요일(0), 토요일(6) 휴식            │
 * │ dailyPostLimit   │ 5 → 하루 글 5개 제한                          │
 * └──────────────────┴─────────────────────────────────────────────┘
 *
 * ■ 페르소나 설정
 * ┌──────────────────┬─────────────────────────────────────────────┐
 * │ personaIndex     │ 0~79 → 고정 페르소나 (아래 표 참고)           │
 * │ personaCategory  │ 'neutral' → 해당 카테고리 내 랜덤             │
 * └──────────────────┴─────────────────────────────────────────────┘
 *
 * ■ 페르소나 인덱스 범위
 * ┌────────┬─────────────┬────────────────────────────────────────┐
 * │ 범위   │ 카테고리     │ 설명                                   │
 * ├────────┼─────────────┼────────────────────────────────────────┤
 * │  0~4   │ positive    │ 긍정적 반응                             │
 * │  5~17  │ neutral     │ 중립적 반응                             │
 * │ 18~23  │ cynical     │ 냉소/시니컬                             │
 * │ 24~27  │ critical    │ 질문/비판                               │
 * │ 28~32  │ ad_skeptic  │ 광고의심                                │
 * │ 33~43  │ community   │ 커뮤니티별                              │
 * │ 44~49  │ mom_cafe    │ 맘카페/여성커뮤                          │
 * │ 50~57  │ interest    │ 관심사별                                │
 * │ 58~64  │ age_group   │ 연령대별                                │
 * │ 65~72  │ lifestyle   │ 생활상황별                              │
 * │ 73~79  │ style       │ 반응유형/말투                            │
 * └────────┴─────────────┴────────────────────────────────────────┘
 */

// 계정 목록 (첫 번째가 메인 계정)
export const NAVER_ACCOUNTS: NaverAccount[] = [
  // {
  //   id: 'ganggyunggyu',
  //   password: '12Qwaszx!@',
  //   nickname: '테스트1',
  //   isMain: true,
  //   activityHours: { start: 9, end: 22 },
  //   personaCategory: 'neutral',
  // },
  {
    id: 'akepzkthf12',
    password: '12qwaszx',
    nickname: '테스트2',
    activityHours: { start: 8, end: 23 },
    dailyPostLimit: 5,
    personaCategory: 'cynical',
  },
  {
    id: 'qwzx16',
    password: '12Qwaszx!@',
    nickname: '테스트4',
    activityHours: { start: 10, end: 21 },
    dailyPostLimit: 4,
    personaCategory: 'ad_skeptic',
  },
  {
    id: 'ggg8019',
    password: '12Qwaszx!@',
    nickname: '테스트5',
    activityHours: { start: 7, end: 24 },
    restDays: [0],
    dailyPostLimit: 6,
    personaCategory: 'community',
  },
];

export const getMainAccount = (): NaverAccount | undefined => {
  return NAVER_ACCOUNTS.find((a) => a.isMain);
};

export const getCommentAccounts = (): NaverAccount[] => {
  return NAVER_ACCOUNTS.filter((a) => !a.isMain);
};

export const getAllAccounts = (): NaverAccount[] => {
  return NAVER_ACCOUNTS;
};
