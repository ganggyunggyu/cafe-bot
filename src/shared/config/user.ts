// 현재는 하드코딩, 나중에 인증 붙이면 session.user.id 사용
export const DEFAULT_USER_ID = 'default-user';

// 나중에 인증 시스템 붙이면 이 함수만 수정
export const getCurrentUserId = (): string => {
  // TODO: 인증 시스템 연동 시 session.user.id 반환
  return DEFAULT_USER_ID;
};
