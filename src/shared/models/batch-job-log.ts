import mongoose, { Schema, Document, Model } from 'mongoose';

interface KeywordResultLog {
  keyword: string;
  articleId?: number;
  success: boolean;
  commentCount: number;
  replyCount: number;
  error?: string;
}

export interface IBatchJobLog extends Document {
  jobType: 'publish' | 'modify';
  cafeId: string;
  keywords: string[];
  results: KeywordResultLog[];
  totalKeywords: number;
  completed: number;
  failed: number;
  startedAt: Date;
  finishedAt?: Date;
  status: 'running' | 'completed' | 'failed';
}

const KeywordResultSchema = new Schema<KeywordResultLog>(
  {
    keyword: { type: String, required: true },
    articleId: { type: Number },
    success: { type: Boolean, required: true },
    commentCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    error: { type: String },
  },
  { _id: false }
);

const BatchJobLogSchema = new Schema<IBatchJobLog>(
  {
    jobType: { type: String, enum: ['publish', 'modify'], required: true },
    cafeId: { type: String, required: true },
    keywords: [{ type: String }],
    results: [KeywordResultSchema],
    totalKeywords: { type: Number, required: true },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  },
  { timestamps: true }
);

BatchJobLogSchema.index({ status: 1, startedAt: -1 });

export const BatchJobLog: Model<IBatchJobLog> =
  mongoose.models.BatchJobLog ||
  mongoose.model<IBatchJobLog>('BatchJobLog', BatchJobLogSchema);
