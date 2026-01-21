'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Account } from '@/shared/models';

export interface AccountInfo {
  accountId: string;
  nickname?: string;
  isMain: boolean;
  personaId?: string;
  dailyPostLimit?: number;
  activityHours?: {
    start: number;
    end: number;
  };
  restDays?: number[];
}

export const getAccountInfoAction = async (accountId: string): Promise<AccountInfo | null> => {
  try {
    await connectDB();

    const account = await Account.findOne({ accountId }).lean();

    if (!account) {
      return {
        accountId,
        isMain: false,
      };
    }

    return {
      accountId: account.accountId,
      nickname: account.nickname,
      isMain: account.isMain ?? false,
      personaId: account.personaId,
      dailyPostLimit: account.dailyPostLimit,
      activityHours: account.activityHours,
      restDays: account.restDays,
    };
  } catch (error) {
    console.error('[ACCOUNT] 정보 조회 실패:', error);
    return {
      accountId,
      isMain: false,
    };
  }
};
