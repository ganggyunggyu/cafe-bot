import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAccount extends Document {
  accountId: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    accountId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: { type: String },
    isMain: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema);
