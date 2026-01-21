'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Account } from '@/shared/models';
import { getCurrentUserId } from '@/shared/config/user';
import { revalidatePath } from 'next/cache';
import type { AccountData, AccountInput } from '../model';

export const getAccountsAction = async (): Promise<AccountData[]> => {
  await connectDB();
  const userId = await getCurrentUserId();
  console.log('[ACCOUNT-ACTION] getAccountsAction 호출, userId:', userId);

  const dbAccounts = await Account.find({ userId, isActive: true }).sort({ isMain: -1, createdAt: 1 }).lean();
  console.log('[ACCOUNT-ACTION] DB 계정 수:', dbAccounts.length);

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
  const userId = await getCurrentUserId();

  const existing = await Account.findOne({ userId, accountId: input.accountId });
  if (existing) {
    return { success: false, error: '이미 존재하는 계정입니다' };
  }

  await Account.create({
    userId,
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
  const userId = await getCurrentUserId();

  await Account.findOneAndUpdate(
    { userId, accountId },
    { $set: input }
  );

  revalidatePath('/accounts');
  return { success: true };
};

export const deleteAccountAction = async (accountId: string) => {
  try {
    await connectDB();
    const userId = await getCurrentUserId();

    const result = await Account.findOneAndUpdate(
      { userId, accountId },
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
