import type { NaverAccount } from '@/shared/lib/account-manager';

const SPECIAL_WRITER_ACCOUNT_IDS = new Set([
  '4giccokx',
  'uqgidh2690',
  'eytkgy5500',
  'yenalk',
  'olgdmp9921',
]);

const LUXURY_CAFE_IDS = new Set([
  '25460974', // 샤넬오픈런
  '25729954', // 쇼핑지름신
]);

const HEALTH_CAFE_IDS = new Set([
  '25636798', // 건강한노후준비
  '25227349', // 건강관리소
]);

export interface CafeAccountPolicy {
  writerAccounts: NaverAccount[];
  commenterAccounts: NaverAccount[];
}

const uniqueAccountsById = (accounts: NaverAccount[]): NaverAccount[] => {
  const seenAccountIds = new Set<string>();

  return accounts.filter(({ id }) => {
    if (seenAccountIds.has(id)) {
      return false;
    }

    seenAccountIds.add(id);
    return true;
  });
};

const filterAccountsByIds = (
  accounts: NaverAccount[],
  allowedAccountIds?: string[]
): NaverAccount[] => {
  if (!allowedAccountIds?.length) {
    return accounts;
  }

  const allowedIds = new Set(allowedAccountIds);
  return accounts.filter(({ id }) => allowedIds.has(id));
};

export const getCafeAccountPolicy = (
  accounts: NaverAccount[],
  cafeId?: string
): CafeAccountPolicy => {
  const uniqueAccounts = uniqueAccountsById(accounts);

  if (!cafeId) {
    return {
      writerAccounts: uniqueAccounts,
      commenterAccounts: uniqueAccounts,
    };
  }

  if (LUXURY_CAFE_IDS.has(cafeId)) {
    return {
      writerAccounts: uniqueAccounts.filter(({ id }) => SPECIAL_WRITER_ACCOUNT_IDS.has(id)),
      commenterAccounts: uniqueAccounts,
    };
  }

  if (HEALTH_CAFE_IDS.has(cafeId)) {
    return {
      writerAccounts: uniqueAccounts.filter(({ id }) => !SPECIAL_WRITER_ACCOUNT_IDS.has(id)),
      commenterAccounts: uniqueAccounts,
    };
  }

  return {
    writerAccounts: uniqueAccounts,
    commenterAccounts: uniqueAccounts,
  };
};

export const getCafeWriterAccounts = (
  accounts: NaverAccount[],
  cafeId?: string,
  allowedAccountIds?: string[]
): NaverAccount[] => {
  const { writerAccounts } = getCafeAccountPolicy(accounts, cafeId);
  return filterAccountsByIds(writerAccounts, allowedAccountIds);
};

export const getCafeCommenterAccounts = (
  accounts: NaverAccount[],
  cafeId?: string,
  excludedAccountId?: string,
  allowedAccountIds?: string[]
): NaverAccount[] => {
  const { commenterAccounts } = getCafeAccountPolicy(accounts, cafeId);
  const filteredCommenters = filterAccountsByIds(commenterAccounts, allowedAccountIds);

  if (!excludedAccountId) {
    return filteredCommenters;
  }

  return filteredCommenters.filter(({ id }) => id !== excludedAccountId);
};
