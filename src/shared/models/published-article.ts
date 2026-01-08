import mongoose, { Schema, Document, Model } from 'mongoose';

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
}

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
  },
  { timestamps: true }
);

PublishedArticleSchema.index({ cafeId: 1, articleId: 1 }, { unique: true });

export const PublishedArticle: Model<IPublishedArticle> =
  mongoose.models.PublishedArticle ||
  mongoose.model<IPublishedArticle>('PublishedArticle', PublishedArticleSchema);
