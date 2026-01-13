import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDailyActivity extends Document {
  accountId: string;
  cafeId: string;
  date: string; // "2025-01-12" 형식
  posts: number;
  comments: number;
  replies: number;
  likes: number;
  lastActivityAt: Date;
}

const DailyActivitySchema = new Schema<IDailyActivity>(
  {
    accountId: { type: String, required: true, index: true },
    cafeId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    posts: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    replies: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DailyActivitySchema.index({ accountId: 1, cafeId: 1, date: 1 }, { unique: true });

export const DailyActivity: Model<IDailyActivity> =
  mongoose.models.DailyActivity ||
  mongoose.model<IDailyActivity>('DailyActivity', DailyActivitySchema);

// 오늘 날짜 문자열 반환
export const getTodayString = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0]; // "2025-01-12"
};

// 활동 기록 증가 (중복 키 에러 처리 포함)
export const incrementActivity = async (
  accountId: string,
  cafeId: string,
  type: 'posts' | 'comments' | 'replies' | 'likes'
): Promise<void> => {
  const today = getTodayString();

  try {
    await DailyActivity.findOneAndUpdate(
      { accountId, cafeId, date: today },
      {
        $inc: { [type]: 1 },
        $set: { lastActivityAt: new Date() },
      },
      { upsert: true }
    );
    console.log(`[ACTIVITY] ${accountId}@${cafeId} ${type} +1 (${today})`);
  } catch (error) {
    // E11000 duplicate key error - 레이스 컨디션 발생 시 재시도
    if (error instanceof Error && error.message.includes('E11000')) {
      await DailyActivity.updateOne(
        { accountId, cafeId, date: today },
        {
          $inc: { [type]: 1 },
          $set: { lastActivityAt: new Date() },
        }
      );
      console.log(`[ACTIVITY] ${accountId}@${cafeId} ${type} +1 (${today}) [재시도 성공]`);
    } else {
      console.error(`[ACTIVITY] 증가 실패:`, error);
    }
  }
};

// 오늘 활동 조회 (계정+카페)
export const getTodayActivity = async (
  accountId: string,
  cafeId: string
): Promise<IDailyActivity | null> => {
  const today = getTodayString();
  return DailyActivity.findOne({ accountId, cafeId, date: today }).lean();
};

// 특정 카페의 오늘 활동 조회 (모든 계정)
export const getCafeTodayActivities = async (
  cafeId: string
): Promise<IDailyActivity[]> => {
  const today = getTodayString();
  return DailyActivity.find({ cafeId, date: today }).lean();
};

// 모든 오늘 활동 조회
export const getAllTodayActivities = async (): Promise<IDailyActivity[]> => {
  const today = getTodayString();
  return DailyActivity.find({ date: today }).lean();
};

// 특정 기간 활동 조회
export const getActivityRange = async (
  accountId: string,
  cafeId: string,
  startDate: string,
  endDate: string
): Promise<IDailyActivity[]> => {
  return DailyActivity.find({
    accountId,
    cafeId,
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: -1 })
    .lean();
};

// 계정의 모든 카페 오늘 활동 합계
export const getAccountTodayTotal = async (
  accountId: string
): Promise<{ posts: number; comments: number; replies: number; likes: number }> => {
  const today = getTodayString();
  const activities = await DailyActivity.find({ accountId, date: today }).lean();

  return activities.reduce(
    (acc, act) => ({
      posts: acc.posts + act.posts,
      comments: acc.comments + act.comments,
      replies: acc.replies + act.replies,
      likes: acc.likes + act.likes,
    }),
    { posts: 0, comments: 0, replies: 0, likes: 0 }
  );
};
