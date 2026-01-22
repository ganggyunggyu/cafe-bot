import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IViralResponse extends Document {
  userId: string;
  keyword: string;
  prompt: string;
  response: string;
  parsedTitle?: string;
  parsedBody?: string;
  parsedComments?: number;
  parseError?: string;
  cafeId?: string;
  contentStyle?: string;
  writerPersona?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ViralResponseSchema = new Schema<IViralResponse>(
  {
    userId: { type: String, required: true, index: true },
    keyword: { type: String, required: true, index: true },
    prompt: { type: String, required: true },
    response: { type: String, required: true },
    parsedTitle: { type: String },
    parsedBody: { type: String },
    parsedComments: { type: Number },
    parseError: { type: String },
    cafeId: { type: String, index: true },
    contentStyle: { type: String },
    writerPersona: { type: String },
  },
  { timestamps: true }
);

ViralResponseSchema.index({ createdAt: -1 });

export const ViralResponse: Model<IViralResponse> =
  mongoose.models.ViralResponse ||
  mongoose.model<IViralResponse>('ViralResponse', ViralResponseSchema);

// 바이럴 응답 저장
export const saveViralResponse = async (
  entry: Omit<IViralResponse, '_id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const doc = await ViralResponse.create(entry);
  console.log(`[VIRAL-DB] 저장됨: ${doc._id}`);
  return doc._id.toString();
};

// 바이럴 응답 목록 조회
export const getViralResponseList = async (
  options: {
    userId?: string;
    cafeId?: string;
    keyword?: string;
    hasError?: boolean;
    limit?: number;
    skip?: number;
  } = {}
): Promise<IViralResponse[]> => {
  const { userId, cafeId, keyword, hasError, limit = 50, skip = 0 } = options;

  const filter: Record<string, unknown> = {};
  if (userId) filter.userId = userId;
  if (cafeId) filter.cafeId = cafeId;
  if (keyword) filter.keyword = { $regex: keyword, $options: 'i' };
  if (hasError === true) filter.parseError = { $exists: true, $ne: null };
  if (hasError === false) filter.parseError = { $exists: false };

  return ViralResponse.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// 바이럴 응답 단건 조회
export const getViralResponseById = async (
  id: string
): Promise<IViralResponse | null> => {
  return ViralResponse.findById(id).lean();
};

// 바이럴 응답 삭제
export const deleteViralResponse = async (id: string): Promise<boolean> => {
  const result = await ViralResponse.findByIdAndDelete(id);
  return !!result;
};

// 전체 삭제
export const clearViralResponses = async (
  options: { userId?: string; cafeId?: string } = {}
): Promise<number> => {
  const filter: Record<string, unknown> = {};
  if (options.userId) filter.userId = options.userId;
  if (options.cafeId) filter.cafeId = options.cafeId;

  const result = await ViralResponse.deleteMany(filter);
  return result.deletedCount || 0;
};

// 통계
export const getViralResponseStats = async (
  userId?: string
): Promise<{ total: number; success: number; failed: number }> => {
  const filter: Record<string, unknown> = {};
  if (userId) filter.userId = userId;

  const [total, failed] = await Promise.all([
    ViralResponse.countDocuments(filter),
    ViralResponse.countDocuments({ ...filter, parseError: { $exists: true, $ne: null } }),
  ]);

  return {
    total,
    success: total - failed,
    failed,
  };
};
