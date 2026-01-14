import type { CafeConfig } from '@/entities/cafe';
import { connectDB } from '@/shared/lib/mongodb';
import { Cafe } from '@/shared/models';

// MongoDB에서 카페 데이터 가져오기
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

// 하위 호환성을 위한 동기 버전 (빈 배열 반환, 사용 자제)
export const CAFE_LIST: CafeConfig[] = [];

export type { CafeConfig } from '@/entities/cafe';
