export type KeywordPromptProfile = 'default' | 'ggg';
export type ViralContentStyle = '정보' | '일상' | '애니';

const SPECIAL_LOGIN_ID = 'qwzx16';

const normalizeLoginId = (loginId?: string | null): string => {
  return (loginId || '').trim().toLowerCase();
};

export const getKeywordPromptProfileForLoginId = (
  loginId?: string | null
): KeywordPromptProfile => {
  return normalizeLoginId(loginId) === SPECIAL_LOGIN_ID ? 'ggg' : 'default';
};

export const getViralContentStyleForLoginId = (
  loginId?: string | null
): ViralContentStyle => {
  return normalizeLoginId(loginId) === SPECIAL_LOGIN_ID ? '애니' : '정보';
};
