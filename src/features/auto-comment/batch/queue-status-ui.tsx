'use client';

import { cn } from '@/shared/lib/cn';
import type { QueueStatusResult } from './batch-actions';

interface QueueStatusUIProps {
  status: QueueStatusResult;
  onStopPolling: () => void;
}

export function QueueStatusUI({ status, onStopPolling }: QueueStatusUIProps) {
  const entries = Object.entries(status);
  if (entries.length === 0) return null;

  // 전체 통계
  const totals = entries.reduce(
    (acc, [, s]) => ({
      waiting: acc.waiting + s.waiting,
      active: acc.active + s.active,
      completed: acc.completed + s.completed,
      failed: acc.failed + s.failed,
    }),
    { waiting: 0, active: 0, completed: 0, failed: 0 }
  );

  const totalJobs = totals.waiting + totals.active + totals.completed + totals.failed;
  const overallProgress = totalJobs > 0 ? ((totals.completed + totals.failed) / totalJobs) * 100 : 0;
  const isAllDone = totals.waiting === 0 && totals.active === 0;

  return (
    <div className={cn('mt-4 space-y-4')}>
      {/* 헤더 + 전체 진행률 */}
      <div className={cn('rounded-2xl bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-sm border border-white/50 p-4 shadow-lg')}>
        <div className={cn('flex items-center justify-between mb-3')}>
          <div className={cn('flex items-center gap-2')}>
            {!isAllDone && (
              <span className={cn('relative flex h-2.5 w-2.5')}>
                <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full bg-(--accent) opacity-75')} />
                <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5 bg-(--accent)')} />
              </span>
            )}
            <h4 className={cn('text-sm font-semibold text-(--ink)')}>
              {isAllDone ? '완료!' : '실행 중...'}
            </h4>
          </div>
          <button
            onClick={onStopPolling}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full transition-all',
              'bg-white/50 hover:bg-white/80 text-(--ink-muted) hover:text-(--ink)',
              'border border-(--border) hover:border-(--accent)'
            )}
          >
            {isAllDone ? '닫기' : '폴링 중지'}
          </button>
        </div>

        {/* 전체 진행률 바 (세그먼트) */}
        <div className={cn('h-3 rounded-full bg-gray-100 overflow-hidden flex')}>
          {totals.completed > 0 && (
            <div
              className={cn('h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500')}
              style={{ width: `${(totals.completed / totalJobs) * 100}%` }}
            />
          )}
          {totals.active > 0 && (
            <div
              className={cn('h-full bg-gradient-to-r from-amber-400 to-amber-500 animate-pulse transition-all duration-500')}
              style={{ width: `${(totals.active / totalJobs) * 100}%` }}
            />
          )}
          {totals.failed > 0 && (
            <div
              className={cn('h-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500')}
              style={{ width: `${(totals.failed / totalJobs) * 100}%` }}
            />
          )}
        </div>

        {/* 통계 */}
        <div className={cn('flex items-center justify-between mt-3 text-xs')}>
          <div className={cn('flex gap-4')}>
            <span className={cn('flex items-center gap-1.5')}>
              <span className={cn('w-2 h-2 rounded-full bg-gray-300')} />
              <span className={cn('text-(--ink-muted)')}>대기 {totals.waiting}</span>
            </span>
            <span className={cn('flex items-center gap-1.5')}>
              <span className={cn('w-2 h-2 rounded-full bg-amber-400 animate-pulse')} />
              <span className={cn('text-(--ink-muted)')}>진행 {totals.active}</span>
            </span>
            <span className={cn('flex items-center gap-1.5')}>
              <span className={cn('w-2 h-2 rounded-full bg-emerald-500')} />
              <span className={cn('text-(--ink-muted)')}>완료 {totals.completed}</span>
            </span>
            {totals.failed > 0 && (
              <span className={cn('flex items-center gap-1.5')}>
                <span className={cn('w-2 h-2 rounded-full bg-rose-500')} />
                <span className={cn('text-rose-600')}>실패 {totals.failed}</span>
              </span>
            )}
          </div>
          <span className={cn('font-medium text-(--ink)')}>
            {Math.round(overallProgress)}%
          </span>
        </div>
      </div>

      {/* 계정별 상세 (접힌 상태로 표시) */}
      <details className={cn('group')}>
        <summary className={cn(
          'flex items-center gap-2 cursor-pointer text-xs text-(--ink-muted) hover:text-(--ink) transition',
          'list-none [&::-webkit-details-marker]:hidden'
        )}>
          <svg className={cn('w-4 h-4 transition-transform group-open:rotate-90')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          계정별 상세 ({entries.length}개)
        </summary>

        <div className={cn('mt-3 grid gap-2')}>
          {entries.map(([accountId, s]) => {
            const total = s.waiting + s.active + s.completed + s.failed;
            if (total === 0) return null;

            const isDone = s.waiting === 0 && s.active === 0;

            return (
              <div
                key={accountId}
                className={cn(
                  'rounded-xl p-3 transition-all',
                  isDone
                    ? 'bg-emerald-50/50 border border-emerald-100'
                    : s.active > 0
                      ? 'bg-amber-50/50 border border-amber-100'
                      : 'bg-white/50 border border-(--border)'
                )}
              >
                <div className={cn('flex items-center justify-between mb-2')}>
                  <div className={cn('flex items-center gap-2')}>
                    {s.active > 0 && (
                      <span className={cn('relative flex h-2 w-2')}>
                        <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75')} />
                        <span className={cn('relative inline-flex rounded-full h-2 w-2 bg-amber-500')} />
                      </span>
                    )}
                    {isDone && s.failed === 0 && (
                      <svg className={cn('w-4 h-4 text-emerald-500')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isDone && s.failed > 0 && (
                      <svg className={cn('w-4 h-4 text-rose-500')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                    <span className={cn('font-medium text-sm text-(--ink)')}>{accountId}</span>
                  </div>
                  <div className={cn('flex items-center gap-3 text-xs')}>
                    {s.waiting > 0 && <span className={cn('text-gray-400')}>대기 {s.waiting}</span>}
                    {s.active > 0 && <span className={cn('text-amber-600 font-medium')}>진행 {s.active}</span>}
                    <span className={cn(isDone && s.failed === 0 ? 'text-emerald-600 font-medium' : 'text-(--ink-muted)')}>
                      {s.completed}/{total}
                    </span>
                    {s.failed > 0 && <span className={cn('text-rose-600')}>실패 {s.failed}</span>}
                  </div>
                </div>

                {/* 미니 진행률 */}
                <div className={cn('h-1.5 rounded-full bg-gray-100 overflow-hidden flex')}>
                  {s.completed > 0 && (
                    <div
                      className={cn('h-full bg-emerald-400')}
                      style={{ width: `${(s.completed / total) * 100}%` }}
                    />
                  )}
                  {s.active > 0 && (
                    <div
                      className={cn('h-full bg-amber-400 animate-pulse')}
                      style={{ width: `${(s.active / total) * 100}%` }}
                    />
                  )}
                  {s.failed > 0 && (
                    <div
                      className={cn('h-full bg-rose-400')}
                      style={{ width: `${(s.failed / total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
