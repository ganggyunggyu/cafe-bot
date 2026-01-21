'use server';

import { connectDB } from '@/shared/lib/mongodb';
import { User } from '@/shared/models';
import { setCurrentUserId, getCurrentUserId } from '@/shared/config/user';

export interface LoginResult {
  success: boolean;
  error?: string;
  user?: {
    userId: string;
    displayName: string;
  };
}

export const login = async (loginId: string, password: string): Promise<LoginResult> => {
  try {
    await connectDB();

    const user = await User.findOne({ loginId, isActive: true });

    if (!user) {
      return { success: false, error: '존재하지 않는 아이디' };
    }

    if (user.password !== password) {
      return { success: false, error: '비밀번호 불일치' };
    }

    await setCurrentUserId(user.userId);

    return {
      success: true,
      user: {
        userId: user.userId,
        displayName: user.displayName,
      },
    };
  } catch (error) {
    console.error('[AUTH] 로그인 실패:', error);
    return { success: false, error: '로그인 처리 중 오류 발생' };
  }
};

export const logout = async (): Promise<void> => {
  await setCurrentUserId('');
};

export const getCurrentUser = async () => {
  try {
    await connectDB();
    const userId = await getCurrentUserId();

    if (!userId || userId === 'default-user') {
      return null;
    }

    const user = await User.findOne({ userId, isActive: true }).lean();

    if (!user) {
      return null;
    }

    return {
      userId: user.userId,
      displayName: user.displayName,
    };
  } catch {
    return null;
  }
};

export const register = async (
  loginId: string,
  password: string,
  displayName: string
): Promise<LoginResult> => {
  try {
    await connectDB();

    const existing = await User.findOne({ loginId });
    if (existing) {
      return { success: false, error: '이미 존재하는 아이디' };
    }

    const userId = `user-${Date.now()}`;

    await User.create({
      userId,
      loginId,
      password,
      displayName,
    });

    await setCurrentUserId(userId);

    return {
      success: true,
      user: { userId, displayName },
    };
  } catch (error) {
    console.error('[AUTH] 회원가입 실패:', error);
    return { success: false, error: '회원가입 처리 중 오류 발생' };
  }
};
