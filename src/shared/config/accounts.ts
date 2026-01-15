import { connectDB } from '@/shared/lib/mongodb';
import { Account } from '@/shared/models';
import type { NaverAccount } from '@/shared/lib/account-manager';

export const getAllAccounts = async (): Promise<NaverAccount[]> => {
  try {
    await connectDB();
    const dbAccounts = await Account.find({ isActive: true })
      .sort({ isMain: -1, createdAt: 1 })
      .lean();

    return dbAccounts.map((a) => ({
      id: a.accountId,
      password: a.password,
      nickname: a.nickname,
      isMain: a.isMain,
      activityHours: a.activityHours,
      restDays: a.restDays,
      dailyPostLimit: a.dailyPostLimit,
      personaId: a.personaId,
    }));
  } catch (error) {
    console.error('[ACCOUNTS] MongoDB 조회 실패:', error);
    return [];
  }
};

export const getMainAccount = async (): Promise<NaverAccount | undefined> => {
  const accounts = await getAllAccounts();
  return accounts.find((a) => a.isMain) || accounts[0];
};

export const getCommentAccounts = async (): Promise<NaverAccount[]> => {
  const accounts = await getAllAccounts();
  return accounts.filter((a) => !a.isMain);
};

// 하위 호환성을 위한 동기 버전 (빈 배열 반환, 사용 자제)
export const NAVER_ACCOUNTS: NaverAccount[] = [];
