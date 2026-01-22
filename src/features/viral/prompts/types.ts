export type ContentStyle = '정보' | '일상' | '케이고';
export type KeywordType = 'own' | 'competitor';
export type ContentType = 'problem' | 'review' | 'lifestyle';

export interface ProductInfo {
  name: string;
  shortName: string;
  effects: string[];
}

export interface ViralPromptInput {
  keyword: string;
  keywordType: KeywordType;
  contentType?: ContentType;
  personaNumber?: number;
  productIndex?: number;
}
