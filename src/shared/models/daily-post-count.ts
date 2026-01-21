import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDailyPostCount extends Document {
  accountId: string;
  cafeId: string;
  date: string; // YYYY-MM-DD 형식
  count: number;
  updatedAt: Date;
}

const DailyPostCountSchema = new Schema<IDailyPostCount>(
  {
    accountId: { type: String, required: true, index: true },
    cafeId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// 계정 + 카페 + 날짜 조합으로 유니크
DailyPostCountSchema.index({ accountId: 1, cafeId: 1, date: 1 }, { unique: true });

export const DailyPostCount: Model<IDailyPostCount> =
  mongoose.models.DailyPostCount ||
  mongoose.model<IDailyPostCount>('DailyPostCount', DailyPostCountSchema);

const getTodayString = (): string => {
  const now = new Date();
  // 한국 시간대(KST, UTC+9) 기준으로 날짜 계산
  const kstOffset = 9 * 60; // 9시간을 분으로
  const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
  return kstTime.toISOString().split('T')[0];
};

export const getTodayPostCount = async (accountId: string, cafeId: string): Promise<number> => {
  const today = getTodayString();
  const record = await DailyPostCount.findOne({ accountId, cafeId, date: today });
  return record?.count ?? 0;
};

export const incrementTodayPostCount = async (accountId: string, cafeId: string): Promise<number> => {
  const today = getTodayString();
  const result = await DailyPostCount.findOneAndUpdate(
    { accountId, cafeId, date: today },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
  return result.count;
};

export const canPostToday = async (
  accountId: string,
  cafeId: string,
  dailyLimit?: number
): Promise<boolean> => {
  if (!dailyLimit) {
    return true;
  }

  const todayCount = await getTodayPostCount(accountId, cafeId);
  return todayCount < dailyLimit;
};

export const getRemainingPostsToday = async (
  accountId: string,
  cafeId: string,
  dailyLimit?: number
): Promise<number> => {
  if (!dailyLimit) {
    return Infinity;
  }

  const todayCount = await getTodayPostCount(accountId, cafeId);
  return Math.max(0, dailyLimit - todayCount);
};
