'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Account, Cafe, type IAccount, type ICafe } from '@/shared/models';
import { revalidatePath } from 'next/cache';

export interface AccountInput {
  accountId: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
}

export interface CafeInput {
  cafeId: string;
  menuId: string;
  name: string;
  categories?: string[];
  isDefault?: boolean;
}

// ========== 계정 CRUD ==========

export async function getAccountsAction() {
  await connectDB();
  const dbAccounts = await Account.find({ isActive: true }).sort({ isMain: -1, createdAt: 1 }).lean();

  // MongoDB에 데이터가 없으면 하드코딩된 데이터 반환
  if (dbAccounts.length === 0) {
    const { NAVER_ACCOUNTS } = await import('@/shared/config/accounts');
    return NAVER_ACCOUNTS.map((a) => ({
      id: a.id,
      password: a.password,
      nickname: a.nickname,
      isMain: a.isMain,
      fromConfig: true,
    }));
  }

  return dbAccounts.map((a) => ({
    id: a.accountId,
    password: a.password,
    nickname: a.nickname,
    isMain: a.isMain,
    fromConfig: false,
  }));
}

export async function addAccountAction(input: AccountInput) {
  await connectDB();

  const existing = await Account.findOne({ accountId: input.accountId });
  if (existing) {
    return { success: false, error: '이미 존재하는 계정이야' };
  }

  await Account.create({
    accountId: input.accountId,
    password: input.password,
    nickname: input.nickname,
    isMain: input.isMain ?? false,
  });

  revalidatePath('/accounts');
  return { success: true };
}

export async function updateAccountAction(accountId: string, input: Partial<AccountInput>) {
  await connectDB();

  await Account.findOneAndUpdate(
    { accountId },
    { $set: input }
  );

  revalidatePath('/accounts');
  return { success: true };
}

export async function deleteAccountAction(accountId: string) {
  await connectDB();

  await Account.findOneAndUpdate(
    { accountId },
    { $set: { isActive: false } }
  );

  revalidatePath('/accounts');
  return { success: true };
}

// ========== 카페 CRUD ==========

export async function getCafesAction() {
  await connectDB();
  const dbCafes = await Cafe.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }).lean();

  // MongoDB에 데이터가 없으면 하드코딩된 데이터 반환
  if (dbCafes.length === 0) {
    const { CAFE_LIST } = await import('@/shared/config/cafes');
    return CAFE_LIST.map((c) => ({
      cafeId: c.cafeId,
      menuId: c.menuId,
      name: c.name,
      categories: c.categories,
      isDefault: c.isDefault,
      fromConfig: true,
    }));
  }

  return dbCafes.map((c) => ({
    cafeId: c.cafeId,
    menuId: c.menuId,
    name: c.name,
    categories: c.categories,
    isDefault: c.isDefault,
    fromConfig: false,
  }));
}

export async function addCafeAction(input: CafeInput) {
  await connectDB();

  const existing = await Cafe.findOne({ cafeId: input.cafeId });
  if (existing) {
    return { success: false, error: '이미 존재하는 카페야' };
  }

  // 기본 카페로 설정하면 기존 기본 카페 해제
  if (input.isDefault) {
    await Cafe.updateMany({}, { $set: { isDefault: false } });
  }

  await Cafe.create({
    cafeId: input.cafeId,
    menuId: input.menuId,
    name: input.name,
    categories: input.categories ?? [],
    isDefault: input.isDefault ?? false,
  });

  revalidatePath('/accounts');
  return { success: true };
}

export async function updateCafeAction(cafeId: string, input: Partial<CafeInput>) {
  await connectDB();

  // 기본 카페로 설정하면 기존 기본 카페 해제
  if (input.isDefault) {
    await Cafe.updateMany({}, { $set: { isDefault: false } });
  }

  await Cafe.findOneAndUpdate(
    { cafeId },
    { $set: input }
  );

  revalidatePath('/accounts');
  return { success: true };
}

export async function deleteCafeAction(cafeId: string) {
  await connectDB();

  await Cafe.findOneAndUpdate(
    { cafeId },
    { $set: { isActive: false } }
  );

  revalidatePath('/accounts');
  return { success: true };
}

// ========== 초기 데이터 마이그레이션 ==========

export async function migrateFromConfigAction() {
  await connectDB();

  // 기존 하드코딩된 계정 가져오기
  const { NAVER_ACCOUNTS } = await import('@/shared/config/accounts');
  const { CAFE_LIST } = await import('@/shared/config/cafes');

  let accountsAdded = 0;
  let cafesAdded = 0;

  // 계정 마이그레이션
  for (const acc of NAVER_ACCOUNTS) {
    const exists = await Account.findOne({ accountId: acc.id });
    if (!exists) {
      await Account.create({
        accountId: acc.id,
        password: acc.password,
        nickname: acc.nickname,
        isMain: acc.isMain ?? false,
      });
      accountsAdded++;
    }
  }

  // 카페 마이그레이션
  for (const cafe of CAFE_LIST) {
    const exists = await Cafe.findOne({ cafeId: cafe.cafeId });
    if (!exists) {
      await Cafe.create({
        cafeId: cafe.cafeId,
        menuId: cafe.menuId,
        name: cafe.name,
        categories: cafe.categories,
        isDefault: cafe.isDefault ?? false,
      });
      cafesAdded++;
    }
  }

  revalidatePath('/accounts');
  return { success: true, accountsAdded, cafesAdded };
}
