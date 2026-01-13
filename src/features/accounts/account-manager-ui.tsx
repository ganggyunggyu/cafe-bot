'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  getAccountsAction,
  addAccountAction,
  deleteAccountAction,
  migrateFromConfigAction,
} from './actions';
import { loginAccountAction } from '../auto-comment/actions';

interface AccountData {
  id: string;
  password: string;
  nickname?: string;
  isMain?: boolean;
  fromConfig?: boolean;
}

export function AccountManagerUI() {
  const [isPending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loginStatus, setLoginStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccount, setNewAccount] = useState({ id: '', password: '', nickname: '' });

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );

  const loadAccounts = () => {
    startTransition(async () => {
      const data = await getAccountsAction();
      setAccounts(data);
    });
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleMigrate = () => {
    startTransition(async () => {
      const result = await migrateFromConfigAction();
      if (result.success) {
        setMessage({ type: 'success', text: `마이그레이션 완료: 계정 ${result.accountsAdded}개, 카페 ${result.cafesAdded}개 추가` });
        loadAccounts();
      }
    });
  };

  const handleAdd = () => {
    if (!newAccount.id || !newAccount.password) {
      setMessage({ type: 'error', text: '아이디와 비밀번호를 입력해' });
      return;
    }

    startTransition(async () => {
      const result = await addAccountAction({
        accountId: newAccount.id,
        password: newAccount.password,
        nickname: newAccount.nickname || undefined,
      });

      if (result.success) {
        setMessage({ type: 'success', text: '계정 추가 완료' });
        setNewAccount({ id: '', password: '', nickname: '' });
        setShowAddForm(false);
        loadAccounts();
      } else {
        setMessage({ type: 'error', text: result.error || '추가 실패' });
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm(`${id} 계정을 삭제할까?`)) return;

    startTransition(async () => {
      await deleteAccountAction(id);
      setMessage({ type: 'success', text: `${id} 삭제 완료` });
      loadAccounts();
    });
  };

  const handleLogin = (id: string, password: string) => {
    setLoginStatus((prev) => ({ ...prev, [id]: 'loading' }));

    startTransition(async () => {
      const result = await loginAccountAction(id, password);
      setLoginStatus((prev) => ({
        ...prev,
        [id]: result.success ? 'success' : 'error',
      }));
      setMessage({
        type: result.success ? 'success' : 'error',
        text: result.success ? `${id} 로그인 성공` : result.error || '로그인 실패',
      });
    });
  };

  const getStatusBadge = (id: string) => {
    const status = loginStatus[id];
    if (status === 'loading') return <span className={cn('text-xs text-blue-500')}>로그인 중...</span>;
    if (status === 'success') return <span className={cn('text-xs text-green-600')}>로그인됨</span>;
    if (status === 'error') return <span className={cn('text-xs text-red-500')}>실패</span>;
    return <span className={cn('text-xs text-gray-400')}>대기</span>;
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-2')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>Accounts</p>
        <div className={cn('flex items-center justify-between')}>
          <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
            등록된 계정 ({accounts.length}개)
          </h2>
          <div className={cn('flex gap-2')}>
            <button
              onClick={handleMigrate}
              disabled={isPending}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                'border border-gray-300 text-gray-600 hover:bg-gray-100',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              설정파일 가져오기
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                'bg-(--accent) text-white hover:brightness-105'
              )}
            >
              {showAddForm ? '취소' : '+ 추가'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-xl border px-3 py-2 text-sm',
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          )}
        >
          {message.text}
        </div>
      )}

      {showAddForm && (
        <div className={cn('rounded-xl border border-(--border) bg-white/50 p-4 space-y-3')}>
          <input
            type="text"
            placeholder="네이버 아이디"
            value={newAccount.id}
            onChange={(e) => setNewAccount((p) => ({ ...p, id: e.target.value }))}
            className={inputClassName}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={newAccount.password}
            onChange={(e) => setNewAccount((p) => ({ ...p, password: e.target.value }))}
            className={inputClassName}
          />
          <input
            type="text"
            placeholder="닉네임 (선택)"
            value={newAccount.nickname}
            onChange={(e) => setNewAccount((p) => ({ ...p, nickname: e.target.value }))}
            className={inputClassName}
          />
          <button
            onClick={handleAdd}
            disabled={isPending}
            className={cn(
              'w-full rounded-xl px-4 py-2 text-sm font-semibold text-white transition',
              'bg-(--accent) hover:brightness-105',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
          >
            계정 추가
          </button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className={cn('rounded-xl border border-(--border) bg-white/50 p-6 text-center')}>
          <p className={cn('text-sm text-(--ink-muted)')}>
            등록된 계정이 없어. "설정파일 가져오기" 또는 "+ 추가" 버튼을 눌러봐.
          </p>
        </div>
      ) : (
        <ul className={cn('space-y-2')}>
          {accounts.map((account, index) => (
            <li
              key={account.id}
              className={cn(
                'rounded-xl border border-(--border) bg-white/70 px-4 py-3 flex items-center justify-between gap-3'
              )}
            >
              <div className={cn('flex items-center gap-3')}>
                <span
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                    account.isMain ? 'bg-(--teal-soft) text-(--teal)' : 'bg-(--accent-soft) text-(--accent)'
                  )}
                >
                  {index + 1}
                </span>
                <div>
                  <div className={cn('flex items-center gap-2')}>
                    <span className={cn('text-sm font-semibold text-(--ink)')}>{account.id}</span>
                    {account.nickname && (
                      <span className={cn('text-xs text-(--ink-muted)')}>({account.nickname})</span>
                    )}
                    {account.isMain && (
                      <span className={cn('text-xs bg-(--teal-soft) text-(--teal) px-1.5 py-0.5 rounded')}>
                        메인
                      </span>
                    )}
                    {account.fromConfig && (
                      <span className={cn('text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded')}>
                        설정파일
                      </span>
                    )}
                  </div>
                  {getStatusBadge(account.id)}
                </div>
              </div>
              <div className={cn('flex gap-2')}>
                <button
                  onClick={() => handleLogin(account.id, account.password)}
                  disabled={isPending || loginStatus[account.id] === 'loading'}
                  className={cn(
                    'rounded-full px-2 py-1 text-xs font-medium transition',
                    'border border-gray-300 text-gray-600 hover:bg-gray-100',
                    'disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                >
                  테스트
                </button>
                {!account.fromConfig && (
                  <button
                    onClick={() => handleDelete(account.id)}
                    disabled={isPending}
                    className={cn(
                      'rounded-full px-2 py-1 text-xs font-medium transition',
                      'border border-red-300 text-red-600 hover:bg-red-50',
                      'disabled:cursor-not-allowed disabled:opacity-60'
                    )}
                  >
                    삭제
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
