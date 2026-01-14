import mongoose, { Schema, Document, Model } from 'mongoose';

// 활동 시간대
export interface ActivityHours {
  start: number; // 0-23
  end: number; // 0-23
}

export interface IAccount extends Document {
  accountId: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  // 활동 설정
  activityHours?: ActivityHours;
  restDays?: number[]; // 0=일, 6=토
  dailyPostLimit?: number;
  // 페르소나 설정
  personaId?: string; // 페르소나 ID (null이면 랜덤)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityHoursSchema = new Schema<ActivityHours>(
  {
    start: { type: Number, min: 0, max: 23 },
    end: { type: Number, min: 0, max: 24 },
  },
  { _id: false }
);

const AccountSchema = new Schema<IAccount>(
  {
    accountId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: { type: String },
    isMain: { type: Boolean, default: false },
    // 활동 설정
    activityHours: { type: ActivityHoursSchema },
    restDays: { type: [Number] },
    dailyPostLimit: { type: Number },
    // 페르소나 설정
    personaId: { type: String }, // 페르소나 ID (null이면 랜덤)
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema);
