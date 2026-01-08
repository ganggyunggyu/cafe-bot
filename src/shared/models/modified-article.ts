import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IModifiedArticle extends Document {
  originalArticleId: Types.ObjectId;
  articleId: number;
  cafeId: string;
  keyword: string;
  newTitle: string;
  newContent: string;
  modifiedAt: Date;
  modifiedBy: string;
}

const ModifiedArticleSchema = new Schema<IModifiedArticle>(
  {
    originalArticleId: { type: Schema.Types.ObjectId, ref: 'PublishedArticle', required: true },
    articleId: { type: Number, required: true, index: true },
    cafeId: { type: String, required: true },
    keyword: { type: String, required: true },
    newTitle: { type: String, required: true },
    newContent: { type: String, required: true },
    modifiedAt: { type: Date, default: Date.now },
    modifiedBy: { type: String, required: true },
  },
  { timestamps: true }
);

ModifiedArticleSchema.index({ cafeId: 1, articleId: 1 });

export const ModifiedArticle: Model<IModifiedArticle> =
  mongoose.models.ModifiedArticle ||
  mongoose.model<IModifiedArticle>('ModifiedArticle', ModifiedArticleSchema);
