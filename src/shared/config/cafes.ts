import type { CafeConfig } from '@/entities/cafe';
import { connectDB } from '@/shared/lib/mongodb';
import { Cafe } from '@/shared/models';

export const getAllCafes = async (): Promise<CafeConfig[]> => {
  try {
    await connectDB();
    const dbCafes = await Cafe.find({ isActive: true })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    return dbCafes.map((c) => {
      const categoryMenuIds =
        c.categoryMenuIds instanceof Map
          ? Object.fromEntries(c.categoryMenuIds)
          : c.categoryMenuIds;

      return {
        cafeId: c.cafeId,
        menuId: c.menuId,
        name: c.name,
        categories: c.categories || [],
        isDefault: c.isDefault,
        categoryMenuIds,
      };
    });
  } catch (error) {
    console.error('[CAFES] MongoDB 조회 실패:', error);
    return [];
  }
};

export const getDefaultCafe = async (): Promise<CafeConfig | undefined> => {
  const cafes = await getAllCafes();
  return cafes.find((c) => c.isDefault) || cafes[0];
};

export const getCafeById = async (cafeId: string): Promise<CafeConfig | undefined> => {
  const cafes = await getAllCafes();
  return cafes.find((c) => c.cafeId === cafeId);
};

export const CAFE_LIST: CafeConfig[] = [];

export type { CafeConfig } from '@/entities/cafe';
