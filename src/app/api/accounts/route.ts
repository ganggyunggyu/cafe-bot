import { NextResponse } from 'next/server';
import { connectDB } from '@/shared/lib/mongodb';
import { Account } from '@/shared/models';
import { getCurrentUserId } from '@/shared/config/user';

export const GET = async () => {
  try {
    await connectDB();
    const userId = await getCurrentUserId();
    const accounts = await Account.find({ userId, isActive: true })
      .sort({ isMain: -1, createdAt: 1 })
      .select('accountId nickname isMain')
      .lean();

    return NextResponse.json(accounts);
  } catch (error) {
    console.error('[API] accounts 조회 실패:', error);
    return NextResponse.json([], { status: 500 });
  }
}
