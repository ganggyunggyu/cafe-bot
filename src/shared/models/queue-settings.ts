import mongoose, { Schema, Document, Model } from 'mongoose';
import { connectDB } from '@/shared/lib/mongodb';

export interface DelayRange {
  min: number; // ms
  max: number; // ms
}

export interface IQueueSettings extends Document {
  delays: {
    betweenPosts: DelayRange; // 글 사이 딜레이
    betweenComments: DelayRange; // 댓글 사이 딜레이
    afterPost: DelayRange; // 글 작성 후 딜레이
  };
  retry: {
    attempts: number; // 재시도 횟수
    backoffDelay: number; // 재시도 간격 (ms)
  };
  limits: {
    enableDailyPostLimit: boolean; // 일일 글 제한 활성화
    maxCommentsPerAccount: number; // 계정당 댓글 수 (0=무제한)
  };
  timeout: number; // 작업 타임아웃 (ms)
  updatedAt: Date;
}

const DelayRangeSchema = new Schema<DelayRange>(
  {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
  },
  { _id: false }
);

const QueueSettingsSchema = new Schema<IQueueSettings>(
  {
    delays: {
      betweenPosts: {
        type: DelayRangeSchema,
        default: { min: 30 * 1000, max: 60 * 1000 },
      },
      betweenComments: {
        type: DelayRangeSchema,
        default: { min: 3 * 1000, max: 10 * 1000 },
      },
      afterPost: {
        type: DelayRangeSchema,
        default: { min: 5 * 1000, max: 15 * 1000 },
      },
    },
    retry: {
      attempts: { type: Number, default: 3 },
      backoffDelay: { type: Number, default: 5000 },
    },
    limits: {
      enableDailyPostLimit: { type: Boolean, default: false },
      maxCommentsPerAccount: { type: Number, default: 0 },
    },
    timeout: { type: Number, default: 5 * 60 * 1000 },
  },
  { timestamps: true }
);

export const QueueSettings: Model<IQueueSettings> =
  mongoose.models.QueueSettings ||
  mongoose.model<IQueueSettings>('QueueSettings', QueueSettingsSchema);

export const DEFAULT_QUEUE_SETTINGS = {
  delays: {
    betweenPosts: { min: 30 * 1000, max: 60 * 1000 }, // 30초~1분
    betweenComments: { min: 3 * 1000, max: 10 * 1000 }, // 3~10초
    afterPost: { min: 5 * 1000, max: 15 * 1000 }, // 5~15초
  },
  retry: { attempts: 3, backoffDelay: 5000 },

  limits: { enableDailyPostLimit: false, maxCommentsPerAccount: 0 },
  timeout: 5 * 60 * 1000,
};

export const getQueueSettings = async (): Promise<IQueueSettings> => {
  await connectDB();
  let settings = await QueueSettings.findOne().lean();

  if (!settings) {
    const created = await QueueSettings.create(DEFAULT_QUEUE_SETTINGS);
    settings = created.toObject();
  }

  return settings as IQueueSettings;
};

export const updateQueueSettings = async (
  updates: Partial<Omit<IQueueSettings, '_id' | 'updatedAt'>>
): Promise<IQueueSettings> => {
  await connectDB();
  const settings = await QueueSettings.findOneAndUpdate(
    {},
    { $set: updates },
    { new: true, upsert: true, lean: true }
  );
  return settings as IQueueSettings;
};

export const getRandomDelay = (range: DelayRange): number => {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
};
