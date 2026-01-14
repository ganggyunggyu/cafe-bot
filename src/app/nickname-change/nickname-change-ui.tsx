'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  changeNicknameByCafeAction,
  changeNicknameByAccountAction,
  changeNicknameAllAction,
} from '@/features/auto-comment/batch/batch-actions';
import type {
  BatchNicknameResult,
  NicknameChangeMode,
} from '@/features/auto-comment/batch/nickname-changer';

interface Account {
  _id: string;
  accountId: string;
  nickname?: string;
  isMain?: boolean;
}

interface Cafe {
  _id: string;
  cafeId: string;
  name: string;
  isDefault?: boolean;
}

export function NicknameChangeUI() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BatchNicknameResult | null>(null);
  const [mode, setMode] = useState<NicknameChangeMode>('all');
  const [selectedCafeId, setSelectedCafeId] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cafes, setCafes] = useState<Cafe[]>([]);

  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountsRes, cafesRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/cafes'),
        ]);
        const accountsData = await accountsRes.json();
        const cafesData = await cafesRes.json();
        setAccounts(accountsData);
        setCafes(cafesData);

        if (cafesData.length > 0) {
          setSelectedCafeId(cafesData[0].cafeId);
        }
        if (accountsData.length > 0) {
          setSelectedAccountId(accountsData[0].accountId);
        }
      } catch (error) {
        console.error('데이터 로드 실패:', error);
      }
    };
    loadData();
  }, []);

  const handleRun = () => {
    startTransition(async () => {
      setResult(null);

      let res: BatchNicknameResult;

      switch (mode) {
        case 'by-cafe':
          res = await changeNicknameByCafeAction(selectedCafeId);
          break;
        case 'by-account':
          res = await changeNicknameByAccountAction(selectedAccountId);
          break;
        case 'all':
        default:
          res = await changeNicknameAllAction();
          break;
      }

      setResult(res);
    });
  };

  const getModeDescription = () => {
    switch (mode) {
      case 'by-cafe':
        return `선택한 카페(${cafes.find((c) => c.cafeId === selectedCafeId)?.name || ''})에서 모든 계정의 닉네임 변경`;
      case 'by-account':
        return `선택한 계정(${selectedAccountId})으로 모든 카페의 닉네임 변경`;
      case 'all':
        return `모든 계정 × 모든 카페 = ${accounts.length * cafes.length}건 처리`;
    }
  };

  const submitButtonClassName = cn(
    'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(168,85,247,0.35)] transition',
    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>
          Nickname Change
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          카페 닉네임 변경
        </h2>
      </div>

      {/* 모드 선택 */}
      <div className={cn('rounded-2xl border border-(--border) bg-white/50 p-4')}>
        <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>변경 모드</h3>
        <div className={cn('grid gap-2 sm:grid-cols-3')}>
          <button
            onClick={() => setMode('by-cafe')}
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-medium transition',
              mode === 'by-cafe'
                ? 'bg-(--accent) text-white'
                : 'bg-white/80 text-(--ink-muted) hover:bg-white'
            )}
          >
            카페 기준
          </button>
          <button
            onClick={() => setMode('by-account')}
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-medium transition',
              mode === 'by-account'
                ? 'bg-(--accent) text-white'
                : 'bg-white/80 text-(--ink-muted) hover:bg-white'
            )}
          >
            계정 기준
          </button>
          <button
            onClick={() => setMode('all')}
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-medium transition',
              mode === 'all'
                ? 'bg-(--accent) text-white'
                : 'bg-white/80 text-(--ink-muted) hover:bg-white'
            )}
          >
            전체 순회
          </button>
        </div>
      </div>

      {/* 선택 옵션 */}
      {mode === 'by-cafe' && (
        <div className={cn('rounded-2xl border border-(--border) bg-white/50 p-4')}>
          <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>카페 선택</h3>
          <select
            value={selectedCafeId}
            onChange={(e) => setSelectedCafeId(e.target.value)}
            className={cn(
              'w-full rounded-xl border border-(--border) bg-white px-4 py-2 text-sm'
            )}
          >
            {cafes.map((cafe) => (
              <option key={cafe.cafeId} value={cafe.cafeId}>
                {cafe.name} {cafe.isDefault && '(기본)'}
              </option>
            ))}
          </select>
          <p className={cn('text-xs text-(--ink-muted) mt-2')}>
            {accounts.length}개 계정의 닉네임이 변경됩니다.
          </p>
        </div>
      )}

      {mode === 'by-account' && (
        <div className={cn('rounded-2xl border border-(--border) bg-white/50 p-4')}>
          <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>계정 선택</h3>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className={cn(
              'w-full rounded-xl border border-(--border) bg-white px-4 py-2 text-sm'
            )}
          >
            {accounts.map((acc) => (
              <option key={acc.accountId} value={acc.accountId}>
                {acc.accountId} {acc.isMain && '(메인)'}
              </option>
            ))}
          </select>
          <p className={cn('text-xs text-(--ink-muted) mt-2')}>
            {cafes.length}개 카페의 닉네임이 변경됩니다.
          </p>
        </div>
      )}

      {/* 현재 설정 요약 */}
      <div className={cn('rounded-2xl border border-(--border) bg-white/50 p-4')}>
        <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>실행 요약</h3>
        <p className={cn('text-sm text-(--ink-muted)')}>{getModeDescription()}</p>
      </div>

      <button
        onClick={handleRun}
        disabled={isPending || accounts.length === 0 || cafes.length === 0}
        className={submitButtonClassName}
      >
        {isPending ? '닉네임 변경 중...' : '닉네임 변경 실행'}
      </button>

      {/* 결과 */}
      {result && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-4',
            result.success
              ? 'border-(--success) bg-(--success-soft)'
              : 'border-(--warning) bg-(--warning-soft)'
          )}
        >
          <div className={cn('flex items-center justify-between mb-3')}>
            <h3
              className={cn(
                'font-semibold',
                result.success ? 'text-(--success)' : 'text-(--warning)'
              )}
            >
              {result.success ? '변경 완료!' : '일부 실패'}
            </h3>
            <div className={cn('text-sm text-(--ink-muted) space-x-2')}>
              <span className={cn('text-(--success)')}>성공 {result.changed}</span>
              {result.failed > 0 && (
                <span className={cn('text-(--danger)')}>실패 {result.failed}</span>
              )}
            </div>
          </div>

          <div className={cn('space-y-2 max-h-[300px] overflow-y-auto')}>
            {result.results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-xl border border-(--border) bg-white/50 px-3 py-2'
                )}
              >
                <div className={cn('flex items-center gap-2')}>
                  <span>{r.success ? '✅' : '❌'}</span>
                  <span className={cn('font-medium text-sm text-(--ink)')}>
                    {r.accountId}
                  </span>
                  <span className={cn('text-(--ink-muted)')}>→</span>
                  <span className={cn('text-sm text-(--ink)')}>{r.cafeName}</span>
                </div>
                {r.success && r.oldNickname && r.newNickname && (
                  <p className={cn('text-xs text-(--ink-muted) mt-1')}>
                    {r.oldNickname} → {r.newNickname}
                  </p>
                )}
                {r.error && (
                  <p className={cn('text-xs text-(--danger) mt-1')}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
