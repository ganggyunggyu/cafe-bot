'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { getAccountsAction } from '@/features/accounts/actions';
import { loginAccountAction } from '../actions';

interface AccountInfo {
  id: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
}

export const AccountListUI = () => {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const loadAccounts = async () => {
      const data = await getAccountsAction();
      setAccounts(data);
    };
    loadAccounts();
  }, []);

  const [loginStatus, setLoginStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleLogin = (id: string, password: string) => {
    setLoginStatus((prev) => ({ ...prev, [id]: 'loading' }));
    setMessage({ type: 'success', text: `${id} 로그인 중...` });

    startTransition(async () => {
      const result = await loginAccountAction(id, password);

      if (result.success) {
        setLoginStatus((prev) => ({ ...prev, [id]: 'success' }));
        setMessage({ type: 'success', text: `${id} 로그인 성공!` });
      } else {
        setLoginStatus((prev) => ({ ...prev, [id]: 'error' }));
        setMessage({ type: 'error', text: result.error || '로그인 실패' });
      }
    });
  };

  const handleLoginAll = () => {
    setMessage({ type: 'success', text: '전체 로그인 시작...' });

    startTransition(async () => {
      for (const account of accounts) {
        setLoginStatus((prev) => ({ ...prev, [account.id]: 'loading' }));
        const result = await loginAccountAction(account.id, account.password);
        setLoginStatus((prev) => ({
          ...prev,
          [account.id]: result.success ? 'success' : 'error',
        }));
      }
      setMessage({ type: 'success', text: '전체 로그인 완료!' });
    });
  };

  const getStatusBadge = (id: string) => {
    const status = loginStatus[id];
    if (status === 'loading') return <span className={cn('text-xs text-(--info)')}>로그인 중...</span>;
    if (status === 'success') return <span className={cn('text-xs text-(--success)')}>로그인됨</span>;
    if (status === 'error') return <span className={cn('text-xs text-(--danger)')}>실패</span>;
    return <span className={cn('text-xs text-(--ink-muted)')}>대기</span>;
  };

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <div className={cn('flex items-center justify-between')}>
          <h2 className={cn('text-lg font-semibold text-(--ink)')}>
            등록된 계정 ({accounts.length}개)
          </h2>
          <button
            onClick={handleLoginAll}
            disabled={isPending}
            className={cn(
              'rounded-lg px-4 py-2 text-xs font-semibold transition-all',
              'border border-(--accent) text-(--accent) hover:bg-(--accent) hover:text-white',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            로그인 테스트
          </button>
        </div>
        <p className={cn('text-xs text-(--ink-muted)')}>
          배치 실행 시 자동 로그인되므로 필수 아님
        </p>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            message.type === 'success'
              ? 'border-(--success)/30 bg-(--success-soft) text-(--success)'
              : 'border-(--danger)/30 bg-(--danger-soft) text-(--danger)'
          )}
        >
          {message.text}
        </div>
      )}

      <ul className={cn('space-y-2')}>
        {accounts.map((account, index) => (
          <li
            key={account.id}
            className={cn(
              'rounded-xl border border-(--border-light) bg-(--surface) px-4 py-3',
              'flex items-center justify-between gap-3 transition-all hover:border-(--border)'
            )}
          >
            <div className={cn('flex items-center gap-3')}>
              <span
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold',
                  'bg-(--accent)/10 text-(--accent)'
                )}
              >
                {index + 1}
              </span>
              <div>
                <div className={cn('flex items-center gap-2')}>
                  <span className={cn('text-sm font-semibold text-(--ink)')}>
                    {account.id}
                  </span>
                  {account.nickname && (
                    <span className={cn('text-xs text-(--ink-muted)')}>
                      ({account.nickname})
                    </span>
                  )}
                </div>
                {getStatusBadge(account.id)}
              </div>
            </div>
            <button
              onClick={() => handleLogin(account.id, account.password)}
              disabled={isPending || loginStatus[account.id] === 'loading'}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                'border border-(--border) text-(--ink-secondary) hover:bg-(--surface-muted)',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              테스트
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
