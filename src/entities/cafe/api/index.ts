'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { Cafe } from '@/shared/models';
import { revalidatePath } from 'next/cache';
import type { CafeData, CafeInput } from '../model';

export const getCafesAction = async (): Promise<CafeData[]> => {
  console.log('[CAFE-ACTION] getCafesAction 호출');
  try {
    await connectDB();
    console.log('[CAFE-ACTION] connectDB 완료');
  } catch (err) {
    console.error('[CAFE-ACTION] connectDB 에러:', err);
    return [];
  }
  const dbCafes = await Cafe.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }).lean();
  console.log('[CAFE-ACTION] DB 카페 수:', dbCafes.length, dbCafes.map(c => c.name));

  if (dbCafes.length === 0) {
    const { CAFE_LIST } = await import('@/shared/config/cafes');
    return CAFE_LIST.map((c) => ({
      cafeId: c.cafeId,
      cafeUrl: c.cafeUrl,
      menuId: c.menuId,
      name: c.name,
      categories: c.categories,
      categoryMenuIds: c.categoryMenuIds,
      isDefault: c.isDefault,
      fromConfig: true,
    }));
  }

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

  const existing = await Cafe.findOne({ cafeId: input.cafeId });
  if (existing) {
    return { success: false, error: '이미 존재하는 카페입니다' };
  }

  if (input.isDefault) {
    await Cafe.updateMany({}, { $set: { isDefault: false } });
  }

  await Cafe.create({
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
