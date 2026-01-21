'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { login, register } from '@/features/auth/actions';
import { userAtom } from '@/shared/store';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useSetAtom(userAtom);
  const [isRegister, setIsRegister] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = isRegister
      ? await register(loginId, password, displayName)
      : await login(loginId, password);

    setLoading(false);

    if (result.success && result.user) {
      setUser(result.user);
      router.push('/');
    } else {
      setError(result.error || '오류 발생');
    }
  };

  return (
    <div className={cn('min-h-screen bg-background flex items-center justify-center p-6')}>
      <div className={cn('w-full max-w-sm space-y-8')}>
        <div className={cn('text-center space-y-2')}>
          <div
            className={cn(
              'mx-auto h-14 w-14 rounded-2xl bg-accent text-background flex items-center justify-center text-xl font-bold'
            )}
          >
            CB
          </div>
          <h1 className={cn('text-2xl font-semibold text-ink mt-4')}>Cafe Bot</h1>
          <p className={cn('text-sm text-ink-muted')}>네이버 카페 자동 발행 시스템</p>
        </div>

        <div className={cn('rounded-2xl border border-border-light bg-surface p-6 space-y-6')}>
          <div className={cn('space-y-2 text-center')}>
            <h2 className={cn('text-lg font-semibold text-ink')}>
              {isRegister ? '회원가입' : '로그인'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <input
                type="text"
                placeholder="이름"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={cn(
                  'w-full rounded-xl border border-border-light bg-background px-4 py-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-accent'
                )}
                required
              />
            )}
            <input
              type="text"
              placeholder="아이디"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className={cn(
                'w-full rounded-xl border border-border-light bg-background px-4 py-3 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-accent'
              )}
              required
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(
                'w-full rounded-xl border border-border-light bg-background px-4 py-3 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-accent'
              )}
              required
            />

            {error && <p className={cn('text-sm text-red-500 text-center')}>{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              isLoading={loading}
              size="lg"
              fullWidth
            >
              {isRegister ? '가입하기' : '로그인'}
            </Button>
          </form>

          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
          >
            {isRegister ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
          </Button>
        </div>
      </div>
    </div>
  );
}
