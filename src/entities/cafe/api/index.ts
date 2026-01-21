'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Cafe } from '@/shared/models';
import { getCurrentUserId } from '@/shared/config/user';
import { revalidatePath } from 'next/cache';
import type { CafeData, CafeInput } from '../model';

export const getCafesAction = async (): Promise<CafeData[]> => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[CAFE-ACTION] connectDB 에러:', err);
    return [];
  }

  const userId = await getCurrentUserId();
  console.log('[CAFE-ACTION] getCafesAction 호출, userId:', userId);

  const dbCafes = await Cafe.find({ userId, isActive: true }).sort({ isDefault: -1, createdAt: 1 }).lean();
  console.log('[CAFE-ACTION] DB 카페 수:', dbCafes.length);

  return dbCafes.map((c) => {
    const categoryMenuIds = c.categoryMenuIds instanceof Map
      ? Object.fromEntries(c.categoryMenuIds)
      : c.categoryMenuIds;
    return {
      cafeId: c.cafeId,
      cafeUrl: c.cafeUrl,
      menuId: c.menuId,
      name: c.name,
      categories: c.categories,
      categoryMenuIds,
      isDefault: c.isDefault,
      fromConfig: false,
    };
  });
};

export const addCafeAction = async (input: CafeInput) => {
  await connectDB();
  const userId = await getCurrentUserId();

  const existing = await Cafe.findOne({ userId, cafeId: input.cafeId });
  if (existing) {
    return { success: false, error: '이미 존재하는 카페입니다' };
  }

  if (input.isDefault) {
    await Cafe.updateMany({ userId }, { $set: { isDefault: false } });
  }

  await Cafe.create({
    userId,
    cafeId: input.cafeId,
    cafeUrl: input.cafeUrl,
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
  const userId = await getCurrentUserId();

  if (input.isDefault) {
    await Cafe.updateMany({ userId }, { $set: { isDefault: false } });
  }

  await Cafe.findOneAndUpdate(
    { userId, cafeId },
    { $set: input }
  );

  revalidatePath('/accounts');
  return { success: true };
};

export const deleteCafeAction = async (cafeId: string) => {
  await connectDB();
  const userId = await getCurrentUserId();

  await Cafe.findOneAndUpdate(
    { userId, cafeId },
    { $set: { isActive: false } }
  );

  revalidatePath('/accounts');
  return { success: true };
};
