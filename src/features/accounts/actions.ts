'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Account, Cafe, type IAccount, type ICafe, type ActivityHours } from '@/shared/models';
import { revalidatePath } from 'next/cache';

export interface AccountInput {
  accountId: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  // 활동 설정
  activityHours?: ActivityHours;
  restDays?: number[];
  dailyPostLimit?: number;
  // 페르소나 설정
  personaId?: string;
}

export interface CafeInput {
  cafeId: string;
  menuId: string;
  name: string;
  categories?: string[];
  categoryMenuIds?: Record<string, string>;
  isDefault?: boolean;
}

// ========== 계정 CRUD ==========

export interface AccountData {
  id: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  activityHours?: ActivityHours;
  restDays?: number[];
  dailyPostLimit?: number;
  personaId?: string;
  fromConfig?: boolean;
}

export const getAccountsAction = async (): Promise<AccountData[]> => {
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
}

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

// ========== 카페 CRUD ==========

export const getCafesAction = async () => {
  console.log('[CAFE-ACTION] getCafesAction 호출');
  console.log('[CAFE-ACTION] MONGODB_URI:', process.env.MONGODB_URI ? '설정됨' : '없음');
  try {
    await connectDB();
    console.log('[CAFE-ACTION] connectDB 완료');
  } catch (err) {
    console.error('[CAFE-ACTION] connectDB 에러:', err);
    return [];
  }
  const dbCafes = await Cafe.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }).lean();
  console.log('[CAFE-ACTION] DB 카페 수:', dbCafes.length, dbCafes.map(c => c.name));

  // MongoDB에 데이터가 없으면 하드코딩된 데이터 반환
  if (dbCafes.length === 0) {
    const { CAFE_LIST } = await import('@/shared/config/cafes');
    return CAFE_LIST.map((c) => ({
      cafeId: c.cafeId,
      menuId: c.menuId,
      name: c.name,
      categories: c.categories,
      categoryMenuIds: c.categoryMenuIds,
      isDefault: c.isDefault,
      fromConfig: true,
    }));
  }

  return dbCafes.map((c) => {
    // Map을 일반 객체로 변환
    const categoryMenuIds = c.categoryMenuIds instanceof Map
      ? Object.fromEntries(c.categoryMenuIds)
      : c.categoryMenuIds;
    return {
      cafeId: c.cafeId,
      menuId: c.menuId,
      name: c.name,
      categories: c.categories,
      categoryMenuIds,
      isDefault: c.isDefault,
      fromConfig: false,
    };
  });
}

export const addCafeAction = async (input: CafeInput) => {
  await connectDB();

  const existing = await Cafe.findOne({ cafeId: input.cafeId });
  if (existing) {
    return { success: false, error: '이미 존재하는 카페입니다' };
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
    categoryMenuIds: input.categoryMenuIds,
    isDefault: input.isDefault ?? false,
  });

  revalidatePath('/accounts');
  return { success: true };
};

export const updateCafeAction = async (cafeId: string, input: Partial<CafeInput>) => {
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
};

export const deleteCafeAction = async (cafeId: string) => {
  await connectDB();

  await Cafe.findOneAndUpdate(
    { cafeId },
    { $set: { isActive: false } }
  );

  revalidatePath('/accounts');
  return { success: true };
};

// ========== 초기 데이터 마이그레이션 ==========

export const migrateFromConfigAction = async () => {
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
        activityHours: acc.activityHours,
        restDays: acc.restDays,
        dailyPostLimit: acc.dailyPostLimit,
        personaId: acc.personaId,
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
        categoryMenuIds: cafe.categoryMenuIds,
        isDefault: cafe.isDefault ?? false,
      });
      cafesAdded++;
    }
  }

  revalidatePath('/accounts');
  return { success: true, accountsAdded, cafesAdded };
};
