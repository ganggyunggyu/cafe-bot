import { NextResponse } from 'next/server';
import { connectDB } from '@/shared/lib/mongodb';
import { Cafe } from '@/shared/models';

export const GET = async () => {
  try {
    await connectDB();
    const cafes = await Cafe.find({ isActive: true })
      .sort({ isDefault: -1, createdAt: 1 })
      .select('cafeId name isDefault')
      .lean();

    return NextResponse.json(cafes);
  } catch (error) {
    console.error('[API] cafes 조회 실패:', error);
    return NextResponse.json([], { status: 500 });
  }
}
