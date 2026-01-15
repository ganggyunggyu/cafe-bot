import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IArticleComment {
  accountId: string;
  nickname: string;
  content: string;
  type: 'comment' | 'reply';
  parentIndex?: number; // 대댓글인 경우 원댓글 인덱스
  commentId?: string;
  commentIndex?: number;
  sequenceId?: string;
  createdAt: Date;
}

export interface IPublishedArticle extends Document {
  articleId: number;
  cafeId: string;
  menuId: string;
  keyword: string;
  title: string;
  content: string;
  articleUrl: string;
  writerAccountId: string;
  publishedAt: Date;
  status: 'published' | 'modified';
  commentCount: number;
  replyCount: number;
  comments: IArticleComment[]; // 댓글/대댓글 목록
}

const ArticleCommentSchema = new Schema<IArticleComment>(
  {
    accountId: { type: String, required: true },
    nickname: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['comment', 'reply'], required: true },
    parentIndex: { type: Number },
    commentId: { type: String },
    commentIndex: { type: Number },
    sequenceId: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PublishedArticleSchema = new Schema<IPublishedArticle>(
  {
    articleId: { type: Number, required: true, index: true },
    cafeId: { type: String, required: true },
    menuId: { type: String, required: true },
    keyword: { type: String, required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    articleUrl: { type: String, required: true },
    writerAccountId: { type: String, required: true },
    publishedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['published', 'modified'], default: 'published' },
    commentCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    comments: { type: [ArticleCommentSchema], default: [] },
  },
  { timestamps: true }
);

PublishedArticleSchema.index({ cafeId: 1, articleId: 1 }, { unique: true });

export const PublishedArticle: Model<IPublishedArticle> =
  mongoose.models.PublishedArticle ||
  mongoose.model<IPublishedArticle>('PublishedArticle', PublishedArticleSchema);

export const hasCommented = async (
  cafeId: string,
  articleId: number,
  accountId: string,
  type: 'comment' | 'reply' = 'comment'
): Promise<boolean> => {
  const article = await PublishedArticle.findOne(
    { cafeId, articleId },
    { comments: 1 }
  ).lean();

  if (!article) return false;

  return (article.comments || []).some(
    (c) => c.accountId === accountId && c.type === type
  );
};

export const addCommentToArticle = async (
  cafeId: string,
  articleId: number,
  comment: Omit<IArticleComment, 'createdAt'>
): Promise<boolean> => {
  const updateField = comment.type === 'comment' ? 'commentCount' : 'replyCount';

  console.log(`[COMMENT-DB] 저장 시도: cafeId=${cafeId}, articleId=${articleId}, accountId=${comment.accountId}, type=${comment.type}`);

  const result = await PublishedArticle.findOneAndUpdate(
    { cafeId, articleId },
    {
      $push: { comments: { ...comment, createdAt: new Date() } },
      $inc: { [updateField]: 1 },
      $setOnInsert: {
        menuId: '',
        keyword: '',
        title: '외부 글',
        content: '',
        articleUrl: `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`,
        writerAccountId: '',
        status: 'published',
      },
    },
    { new: true, upsert: true }
  );

  if (result) {
    console.log(`[COMMENT-DB] 저장 성공: #${articleId} - ${comment.type} by ${comment.accountId}`);
  }

  return !!result;
};

export const getArticleComments = async (
  cafeId: string,
  articleId: number
): Promise<IArticleComment[]> => {
  const article = await PublishedArticle.findOne(
    { cafeId, articleId },
    { comments: 1 }
  ).lean();

  return article?.comments || [];
};

export const getAccountCommentStats = async (
  accountId: string
): Promise<{ comments: number; replies: number }> => {
  const result = await PublishedArticle.aggregate([
    { $unwind: '$comments' },
    { $match: { 'comments.accountId': accountId } },
    {
      $group: {
        _id: '$comments.type',
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = { comments: 0, replies: 0 };
  for (const r of result) {
    if (r._id === 'comment') stats.comments = r.count;
    if (r._id === 'reply') stats.replies = r.count;
  }

  return stats;
};

export const getArticleIdByKeyword = async (
  cafeId: string,
  keyword: string
): Promise<number | null> => {
  const article = await PublishedArticle.findOne(
    { cafeId, keyword },
    { articleId: 1 }
  )
    .sort({ publishedAt: -1 })
    .lean();

  return article?.articleId ?? null;
};
