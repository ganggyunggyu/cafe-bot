export interface CafeConfig {
  cafeId: string;
  cafeUrl: string;
  menuId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
  categoryMenuIds?: Record<string, string>;
  /** 다른 카페 카테고리를 이 카페 카테고리로 매핑 (예: { '건강': '웰빙' }) */
  categoryAliases?: Record<string, string>;
}

export type CafeCategoryMap = Record<string, string>;

export interface CafeData extends CafeConfig {
  fromConfig?: boolean;
}

export interface CafeInput {
  cafeId: string;
  cafeUrl: string;
  menuId: string;
  name: string;
  categories?: string[];
  categoryMenuIds?: Record<string, string>;
  categoryAliases?: Record<string, string>;
  isDefault?: boolean;
}
