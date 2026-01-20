'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Account, Cafe } from '@/shared/models';
import { revalidatePath } from 'next/cache';

export const migrateFromConfigAction = async () => {
  await connectDB();

  const { NAVER_ACCOUNTS } = await import('@/shared/config/accounts');
  const { CAFE_LIST } = await import('@/shared/config/cafes');

  let accountsAdded = 0;
  let cafesAdded = 0;

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
