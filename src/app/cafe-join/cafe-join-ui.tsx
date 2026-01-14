'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { runCafeJoinBatchAction } from '@/features/auto-comment/batch/batch-actions';
import { getAccountsAction, getCafesAction } from '@/features/accounts/actions';
import type { BatchJoinResult } from '@/features/auto-comment/batch/cafe-join';

interface AccountInfo {
  id: string;
  isMain?: boolean;
}

interface CafeInfo {
  cafeId: string;
  name: string;
  isDefault?: boolean;
}

export function CafeJoinUI() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BatchJoinResult | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [cafes, setCafes] = useState<CafeInfo[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const [accountsData, cafesData] = await Promise.all([
        getAccountsAction(),
        getCafesAction(),
      ]);
      setAccounts(accountsData.map((a) => ({ id: a.id, isMain: a.isMain })));
      setCafes(cafesData.map((c) => ({ cafeId: c.cafeId, name: c.name, isDefault: c.isDefault })));
    };
    loadData();
  }, []);

  const handleRun = () => {
    startTransition(async () => {
      setResult(null);
      const res = await runCafeJoinBatchAction();
      setResult(res);
    });
  };

  const submitButtonClassName = cn(
    'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(20,184,166,0.35)] transition',
    'bg-[linear-gradient(135deg,var(--teal),var(--teal-strong))] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.3em] text-(--ink-muted)'
          )}
        >
          Batch Join
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          일괄 카페 가입
        </h2>
      </div>

      {/* 현재 설정 요약 */}
      <div className={cn('rounded-2xl border border-(--border) bg-white/50 p-4')}>
        <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
          현재 설정
        </h3>
        <div className={cn('grid gap-4 sm:grid-cols-2')}>
          <div>
            <p className={cn('text-xs font-medium text-(--ink-muted) mb-2')}>
              계정 ({accounts.length}개)
            </p>
            <div className={cn('space-y-1')}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className={cn(
                    'text-sm px-2 py-1 rounded-lg bg-white/80',
                    acc.isMain && 'border border-(--accent)'
                  )}
                >
                  {acc.id} {acc.isMain && <span className={cn('text-xs text-(--accent)')}>(메인)</span>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className={cn('text-xs font-medium text-(--ink-muted) mb-2')}>
              카페 ({cafes.length}개)
            </p>
            <div className={cn('space-y-1')}>
              {cafes.map((cafe) => (
                <div
                  key={cafe.cafeId}
                  className={cn(
                    'text-sm px-2 py-1 rounded-lg bg-white/80',
                    cafe.isDefault && 'border border-(--teal)'
                  )}
                >
                  {cafe.name} {cafe.isDefault && <span className={cn('text-xs text-(--teal)')}>(기본)</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className={cn('text-xs text-(--ink-muted) mt-3')}>
          총 {accounts.length * cafes.length}건 처리 예정
        </p>
      </div>

      <button
        onClick={handleRun}
        disabled={isPending}
        className={submitButtonClassName}
      >
        {isPending ? '가입 진행 중...' : '전체 카페 가입 실행'}
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
              {result.success ? '가입 완료!' : '일부 실패'}
            </h3>
            <div className={cn('text-sm text-(--ink-muted) space-x-2')}>
              <span className={cn('text-(--success)')}>가입 {result.joined}</span>
              <span>이미 {result.alreadyMember}</span>
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
                  <span>
                    {r.success
                      ? r.alreadyMember
                        ? '⚪'
                        : '✅'
                      : '❌'}
                  </span>
                  <span className={cn('font-medium text-sm text-(--ink)')}>
                    {r.accountId}
                  </span>
                  <span className={cn('text-(--ink-muted)')}>→</span>
                  <span className={cn('text-sm text-(--ink)')}>
                    {r.cafeName}
                  </span>
                </div>
                {r.error && (
                  <p className={cn('text-xs text-(--danger) mt-1')}>
                    {r.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
