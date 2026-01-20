'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Account } from '@/shared/models';
import { revalidatePath } from 'next/cache';
import type { AccountData, AccountInput } from '../model';

export const getAccountsAction = async (): Promise<AccountData[]> => {
  await connectDB();
  const dbAccounts = await Account.find({ isActive: true }).sort({ isMain: -1, createdAt: 1 }).lean();

  if (dbAccounts.length === 0) {
    const { NAVER_ACCOUNTS } = await import('@/shared/config/accounts');
    return NAVER_ACCOUNTS.map((a) => ({
      id: a.id,
      password: a.password,
      nickname: a.nickname,
      isMain: a.isMain,
      activityHours: a.activityHours,
      restDays: a.restDays,
      dailyPostLimit: a.dailyPostLimit,
      personaId: a.personaId,
      fromConfig: true,
    }));
  }

  return dbAccounts.map((a) => ({
    id: a.accountId,
    password: a.password,
    nickname: a.nickname,
    isMain: a.isMain,
    activityHours: a.activityHours,
    restDays: a.restDays,
    dailyPostLimit: a.dailyPostLimit,
    personaId: a.personaId,
    fromConfig: false,
  }));
};

export const addAccountAction = async (input: AccountInput) => {
  await connectDB();

  const existing = await Account.findOne({ accountId: input.accountId });
  if (existing) {
    return { success: false, error: '이미 존재하는 계정입니다' };
  }

  await Account.create({
    accountId: input.accountId,
    password: input.password,
    nickname: input.nickname,
    isMain: input.isMain ?? false,
    activityHours: input.activityHours,
    restDays: input.restDays,
    dailyPostLimit: input.dailyPostLimit,
    personaId: input.personaId,
  });

  revalidatePath('/accounts');
  return { success: true };
};

export const updateAccountAction = async (accountId: string, input: Partial<AccountInput>) => {
  await connectDB();

  await Account.findOneAndUpdate(
    { accountId },
    { $set: input }
  );

  revalidatePath('/accounts');
  return { success: true };
};

export const deleteAccountAction = async (accountId: string) => {
  try {
    await connectDB();

    const result = await Account.findOneAndUpdate(
      { accountId },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!result) {
      console.error(`[DELETE] 계정 찾기 실패: ${accountId}`);
      return { success: false, error: '계정을 찾을 수 없습니다' };
    }

    console.log(`[DELETE] 계정 삭제 완료: ${accountId}`);
    revalidatePath('/accounts');
    return { success: true };
  } catch (error) {
    console.error(`[DELETE] 에러:`, error);
    return { success: false, error: '삭제 중 오류 발생' };
  }
};
