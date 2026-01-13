'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/shared/lib/cn';
import { getAllQueueStatus, clearAccountQueue, clearAllQueues, type AllQueueStatus } from './queue-actions';

export const QueueStatusUI = () => {
  const [status, setStatus] = useState<AllQueueStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllQueueStatus();
      setStatus(data);
    } catch (error) {
      console.error('큐 상태 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // 10초마다 자동 새로고침
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleClearAccount = async (accountId: string) => {
    if (!confirm(`${accountId} 큐를 클리어하시겠습니까?`)) return;
    setClearing(accountId);
    try {
      await clearAccountQueue(accountId);
      await fetchStatus();
    } finally {
      setClearing(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('모든 큐를 클리어하시겠습니까?')) return;
    setClearing('all');
    try {
      await clearAllQueues();
      await fetchStatus();
    } finally {
      setClearing(null);
    }
  };

  const hasActiveJobs = status && (status.total.waiting > 0 || status.total.active > 0 || status.total.delayed > 0);

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('flex items-center justify-between')}>
        <h3 className={cn('font-semibold text-(--ink)')}>큐 상태</h3>
        <div className={cn('flex items-center gap-2')}>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className={cn(
              'px-3 py-1.5 text-xs rounded-lg',
              'bg-(--surface) border border-(--border) text-(--ink-muted)',
              'hover:bg-(--surface-hover) disabled:opacity-50'
            )}
          >
            {loading ? '로딩...' : '새로고침'}
          </button>
          {hasActiveJobs && (
            <button
              onClick={handleClearAll}
              disabled={clearing === 'all'}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg',
                'bg-red-500 text-white',
                'hover:bg-red-600 disabled:opacity-50'
              )}
            >
              {clearing === 'all' ? '클리어 중...' : '전체 클리어'}
            </button>
          )}
        </div>
      </div>

      {/* 전체 요약 */}
      {status && (
        <div className={cn('grid grid-cols-5 gap-2 text-center')}>
          <div className={cn('p-2 rounded-lg bg-yellow-50')}>
            <p className={cn('text-xs text-yellow-600')}>대기</p>
            <p className={cn('text-lg font-bold text-yellow-700')}>{status.total.waiting}</p>
          </div>
          <div className={cn('p-2 rounded-lg bg-blue-50')}>
            <p className={cn('text-xs text-blue-600')}>진행</p>
            <p className={cn('text-lg font-bold text-blue-700')}>{status.total.active}</p>
          </div>
          <div className={cn('p-2 rounded-lg bg-purple-50')}>
            <p className={cn('text-xs text-purple-600')}>예약</p>
            <p className={cn('text-lg font-bold text-purple-700')}>{status.total.delayed}</p>
          </div>
          <div className={cn('p-2 rounded-lg bg-green-50')}>
            <p className={cn('text-xs text-green-600')}>완료</p>
            <p className={cn('text-lg font-bold text-green-700')}>{status.total.completed}</p>
          </div>
          <div className={cn('p-2 rounded-lg bg-red-50')}>
            <p className={cn('text-xs text-red-600')}>실패</p>
            <p className={cn('text-lg font-bold text-red-700')}>{status.total.failed}</p>
          </div>
        </div>
      )}

      {/* 계정별 상세 */}
      {status && status.queues.length > 0 && (
        <div className={cn('space-y-2')}>
          <p className={cn('text-xs text-(--ink-muted)')}>계정별 상세</p>
          <div className={cn('max-h-48 overflow-y-auto space-y-1')}>
            {status.queues.map((q) => {
              const hasJobs = q.waiting > 0 || q.active > 0 || q.delayed > 0;
              return (
                <div
                  key={q.accountId}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg text-xs',
                    hasJobs ? 'bg-blue-50' : 'bg-(--surface)'
                  )}
                >
                  <span className={cn('font-medium')}>{q.accountId}</span>
                  <div className={cn('flex items-center gap-3')}>
                    <span className={cn('text-yellow-600')}>대기 {q.waiting}</span>
                    <span className={cn('text-blue-600')}>진행 {q.active}</span>
                    <span className={cn('text-purple-600')}>예약 {q.delayed}</span>
                    {hasJobs && (
                      <button
                        onClick={() => handleClearAccount(q.accountId)}
                        disabled={clearing === q.accountId}
                        className={cn(
                          'px-2 py-0.5 rounded bg-red-100 text-red-600',
                          'hover:bg-red-200 disabled:opacity-50'
                        )}
                      >
                        {clearing === q.accountId ? '...' : '클리어'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!status && !loading && (
        <p className={cn('text-sm text-(--ink-muted) text-center py-4')}>큐 상태를 불러오는 중...</p>
      )}
    </div>
  );
};
