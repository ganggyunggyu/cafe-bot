'use client';

import { useState, useEffect, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  getAccountList,
  addAccountAction,
  removeAccountAction,
  setMainAccountAction,
  loginAccountAction,
} from './account-actions';
import type { NaverAccount } from '@/shared/lib/account-manager';
import { AccountManagerForm } from './account-manager-form';
import { AccountManagerList } from './account-manager-list';

export function AccountManagerUI() {
  const [accounts, setAccounts] = useState<NaverAccount[]>([]);
  const [isPending, startTransition] = useTransition();
  const [newAccount, setNewAccount] = useState({ id: '', password: '', nickname: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = () => {
    startTransition(async () => {
      const result = await getAccountList();
      if (result.success && result.accounts) {
        setAccounts(result.accounts);
      }
    });
  };

  const handleAddAccount = () => {
    const { id, password, nickname } = newAccount;

    if (!id || !password) {
      setMessage({ type: 'error', text: 'ID와 비밀번호를 입력해줘.' });
      return;
    }

    startTransition(async () => {
      const result = await addAccountAction({
        id,
        password,
        nickname: nickname || undefined,
      });

      if (result.success && result.accounts) {
        setAccounts(result.accounts);
        setNewAccount({ id: '', password: '', nickname: '' });
        setMessage({ type: 'success', text: '계정이 추가됐어.' });
      } else {
        setMessage({ type: 'error', text: result.error || '추가 실패' });
      }
    });
  };

  const handleRemoveAccount = (id: string) => {
    startTransition(async () => {
      const result = await removeAccountAction(id);
      if (result.success && result.accounts) {
        setAccounts(result.accounts);
        setMessage({ type: 'success', text: '계정이 삭제됐어.' });
      }
    });
  };

  const handleSetMain = (id: string) => {
    startTransition(async () => {
      const result = await setMainAccountAction(id);
      if (result.success && result.accounts) {
        setAccounts(result.accounts);
        setMessage({ type: 'success', text: '메인 계정이 설정됐어.' });
      }
    });
  };

  const handleLogin = (account: NaverAccount) => {
    startTransition(async () => {
      setMessage({ type: 'success', text: `${account.id} 로그인 시도 중...` });
      const result = await loginAccountAction(account.id, account.password);
      if (result.success) {
        setMessage({ type: 'success', text: `${account.id} 로그인 성공!` });
      } else {
        setMessage({ type: 'error', text: result.error || '로그인 실패' });
      }
    });
  };

  const handleFieldChange = (field: 'id' | 'password' | 'nickname', value: string) => {
    setNewAccount((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]'
          )}
        >
          Account Desk
        </p>
        <h2 className={cn('font-[var(--font-display)] text-xl text-[color:var(--ink)]')}>
          계정 관리
        </h2>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm',
            message.type === 'success'
              ? 'border-[color:var(--success)] bg-[color:var(--success-soft)] text-[color:var(--success)]'
              : 'border-[color:var(--danger)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]'
          )}
        >
          {message.text}
        </div>
      )}

      <AccountManagerForm
        id={newAccount.id}
        password={newAccount.password}
        nickname={newAccount.nickname}
        isPending={isPending}
        onFieldChange={handleFieldChange}
        onSubmit={handleAddAccount}
      />

      <AccountManagerList
        accounts={accounts}
        isPending={isPending}
        onLogin={handleLogin}
        onSetMain={handleSetMain}
        onRemove={handleRemoveAccount}
      />
    </div>
  );
}
