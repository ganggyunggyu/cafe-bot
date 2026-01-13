import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDailyPostCount extends Document {
  accountId: string;
  date: string; // YYYY-MM-DD 형식
  count: number;
  updatedAt: Date;
}

const DailyPostCountSchema = new Schema<IDailyPostCount>(
  {
    accountId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// 복합 인덱스: accountId + date 조합으로 빠르게 조회
DailyPostCountSchema.index({ accountId: 1, date: 1 }, { unique: true });

export const DailyPostCount: Model<IDailyPostCount> =
  mongoose.models.DailyPostCount ||
  mongoose.model<IDailyPostCount>('DailyPostCount', DailyPostCountSchema);

// 오늘 날짜 문자열 반환 (YYYY-MM-DD)
const getTodayString = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

// 계정의 오늘 포스트 수 조회
export const getTodayPostCount = async (accountId: string): Promise<number> => {
  const today = getTodayString();
  const record = await DailyPostCount.findOne({ accountId, date: today });
  return record?.count ?? 0;
};

// 계정의 오늘 포스트 수 증가
export const incrementTodayPostCount = async (accountId: string): Promise<number> => {
  const today = getTodayString();
  const result = await DailyPostCount.findOneAndUpdate(
    { accountId, date: today },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
  return result.count;
};

// 계정이 오늘 더 글을 쓸 수 있는지 확인
export const canPostToday = async (accountId: string, dailyLimit?: number): Promise<boolean> => {
  // 제한 없으면 항상 가능
  if (!dailyLimit) {
    return true;
  }

  const todayCount = await getTodayPostCount(accountId);
  return todayCount < dailyLimit;
};

// 계정의 오늘 남은 포스트 수 조회
export const getRemainingPostsToday = async (
  accountId: string,
  dailyLimit?: number
): Promise<number> => {
  if (!dailyLimit) {
    return Infinity;
  }

  const todayCount = await getTodayPostCount(accountId);
  return Math.max(0, dailyLimit - todayCount);
};
