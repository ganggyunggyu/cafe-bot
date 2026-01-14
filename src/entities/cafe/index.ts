export interface CafeConfig {
  cafeId: string;
  menuId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
  categoryMenuIds?: Record<string, string>;
}

export type CafeCategoryMap = Record<string, string>;
