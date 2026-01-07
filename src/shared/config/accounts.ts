import type { NaverAccount } from '@/shared/lib/account-manager';

// 계정 목록 (첫 번째가 메인 계정)
export const NAVER_ACCOUNTS: NaverAccount[] = [
  {
    id: 'ganggyunggyu',
    password: '12Qwaszx!@',
    nickname: '테스트1',
    isMain: true,
  },
  {
    id: 'akepzkthf12',
    password: '12qwaszx',
    nickname: '테스트2',
  },
  {
    id: 'qwzx8019',
    password: '12Qwaszx!@',
    nickname: '테스트3',
  },
  {
    id: 'qwzx16',
    password: '12Qwaszx!@',
    nickname: '테스트4',
  },
];

export function getMainAccount(): NaverAccount | undefined {
  return NAVER_ACCOUNTS.find((a) => a.isMain);
}

export function getCommentAccounts(): NaverAccount[] {
  return NAVER_ACCOUNTS.filter((a) => !a.isMain);
}

export function getAllAccounts(): NaverAccount[] {
  return NAVER_ACCOUNTS;
}
