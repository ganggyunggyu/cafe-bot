import { connectDB } from '@/shared/lib/mongodb';
import { Account } from '@/shared/models';
import { getCurrentUserId } from './user';
import type { NaverAccount } from '@/shared/lib/account-manager';

export const getAllAccounts = async (userId?: string): Promise<NaverAccount[]> => {
  try {
    await connectDB();
    const targetUserId = userId || (await getCurrentUserId());
    console.log('[ACCOUNTS] 조회 시작, userId:', targetUserId);

    const dbAccounts = await Account.find({ userId: targetUserId, isActive: true })
      .sort({ isMain: -1, createdAt: 1 })
      .lean();

    console.log('[ACCOUNTS] 조회 결과:', dbAccounts.length, '개');

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

export const getAllAccountsForMonitoring = async (): Promise<NaverAccount[]> => {
  try {
    await connectDB();
    console.log('[ACCOUNTS] 모니터링용 전체 계정 조회');

    const dbAccounts = await Account.find({ isActive: true })
      .sort({ userId: 1, isMain: -1, createdAt: 1 })
      .lean();

    console.log('[ACCOUNTS] 모니터링용 조회 결과:', dbAccounts.length, '개');

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
    console.error('[ACCOUNTS] 모니터링용 조회 실패:', error);
    return [];
  }
};

// accountId로 직접 조회 (userId 없는 경우 fallback)
export const getAccountById = async (accountId: string): Promise<NaverAccount | null> => {
  try {
    await connectDB();
    console.log(`[ACCOUNTS] accountId 직접 조회: ${accountId}`);
    const dbAccount = await Account.findOne({ accountId, isActive: true }).lean();
    console.log(`[ACCOUNTS] 조회 결과:`, dbAccount ? `찾음 (${dbAccount.nickname})` : '없음');

    if (!dbAccount) return null;

    return {
      id: dbAccount.accountId,
      password: dbAccount.password,
      nickname: dbAccount.nickname,
      isMain: dbAccount.isMain,
      activityHours: dbAccount.activityHours,
      restDays: dbAccount.restDays,
      dailyPostLimit: dbAccount.dailyPostLimit,
      personaId: dbAccount.personaId,
    };
  } catch (error) {
    console.error('[ACCOUNTS] accountId 조회 실패:', error);
    return null;
  }
};

// 하위 호환성을 위한 동기 버전 (빈 배열 반환, 사용 자제)
export const NAVER_ACCOUNTS: NaverAccount[] = [];
