import { cookies } from 'next/headers';

export const DEFAULT_USER_ID = 'default-user';
export const USER_COOKIE_NAME = 'cafe-bot-user-id';

export const getCurrentUserId = async (): Promise<string> => {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(USER_COOKIE_NAME)?.value || DEFAULT_USER_ID;
  } catch {
    return DEFAULT_USER_ID;
  }
};

export const setCurrentUserId = async (userId: string): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.set(USER_COOKIE_NAME, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30일
  });
};
