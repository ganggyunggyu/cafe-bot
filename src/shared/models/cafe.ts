import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICafe extends Document {
  cafeId: string;
  menuId: string;
  name: string;
  categories: string[];
  categoryMenuIds?: Record<string, string>;
  isDefault?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CafeSchema = new Schema<ICafe>(
  {
    cafeId: { type: String, required: true, unique: true },
    menuId: { type: String, required: true },
    name: { type: String, required: true },
    categories: { type: [String], default: [] },
    categoryMenuIds: { type: Map, of: String },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Cafe: Model<ICafe> =
  mongoose.models.Cafe || mongoose.model<ICafe>('Cafe', CafeSchema);
