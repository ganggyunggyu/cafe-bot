'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { getCafesAction } from '@/features/accounts/actions';
import { PostOptionsUI } from '../batch/post-options-ui';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '../batch/types';
import { runPostOnlyAction, getPostQueueStatusAction, type QueueBatchResult, type QueueStatusResult } from './queue-actions';

interface CafeConfig {
  cafeId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
}

export function PostOnlyUI() {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [ref, setRef] = useState('');
  const [postOptions, setPostOptions] = useState<PostOptions>(DEFAULT_POST_OPTIONS);
  const [result, setResult] = useState<QueueBatchResult | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // 카페 데이터 로딩
  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) setSelectedCafeId(defaultCafe.cafeId);
    };
    loadCafes();
  }, []);

  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId);

  // 큐 상태 폴링
  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      const status = await getPostQueueStatusAction();
      setQueueStatus(status);
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [isPolling]);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );

  const handleSubmit = () => {
    const keywords = keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keywords.length === 0) return;

    startTransition(async () => {
      setResult(null);
      const res = await runPostOnlyAction({
        keywords,
        ref: ref || undefined,
        cafeId: selectedCafeId || undefined,
        postOptions,
      });
      setResult(res);
      if (res.success) {
        setIsPolling(true);
      }
    });
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>
          Post Only Mode
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          글만 발행
        </h2>
        <p className={cn('text-sm text-(--ink-muted)')}>
          댓글 없이 글만 발행 (원고 축적용)
        </p>
      </div>

      <div className={cn('space-y-3')}>
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>
            카페 선택
          </label>
          <select
            value={selectedCafeId}
            onChange={(e) => setSelectedCafeId(e.target.value)}
            className={inputClassName}
          >
            {cafes.map((cafe) => (
              <option key={cafe.cafeId} value={cafe.cafeId}>
                {cafe.name} {cafe.isDefault ? '(기본)' : ''}
              </option>
            ))}
          </select>
          {selectedCafe && (
            <p className={cn('text-xs text-(--ink-muted)')}>
              카테고리: {selectedCafe.categories.join(', ')}
            </p>
          )}
        </div>

        <textarea
          placeholder="키워드 목록 (한 줄에 하나씩)&#10;카테고리 지정: 키워드:카테고리&#10;예:&#10;제주도 맛집&#10;서울 카페:일상"
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          className={cn(inputClassName, 'min-h-[100px] resize-none')}
          rows={4}
        />

        <input
          type="text"
          placeholder="참고 URL (선택)"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className={inputClassName}
        />

        <div className={cn('rounded-xl border border-(--border) bg-white/50 p-3')}>
          <PostOptionsUI options={postOptions} onChange={setPostOptions} />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isPending || !keywordsText.trim()}
        className={cn(
          'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
          'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        {isPending ? '발행 중...' : '글만 발행'}
      </button>

      {result && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-4',
            result.success
              ? 'border-(--success) bg-(--success-soft)'
              : 'border-(--danger) bg-(--danger-soft)'
          )}
        >
          <div className={cn('flex items-center justify-between mb-3')}>
            <h3
              className={cn(
                'font-semibold',
                result.success ? 'text-(--success)' : 'text-(--danger)'
              )}
            >
              {result.success ? '큐에 추가됨' : '실패'}
            </h3>
            <span className={cn('text-sm text-(--ink-muted)')}>
              {result.jobsAdded}개 작업
            </span>
          </div>
          <p className={cn('text-sm text-(--ink-muted)')}>{result.message}</p>

          {/* 큐 진행 상황 */}
          {queueStatus && Object.keys(queueStatus).length > 0 && (
            <div className={cn('mt-4 space-y-2')}>
              <div className={cn('flex items-center justify-between')}>
                <h4 className={cn('text-sm font-medium text-(--ink)')}>진행 상황</h4>
                <button
                  onClick={() => setIsPolling(false)}
                  className={cn('text-xs px-2 py-1 rounded-lg bg-white/50 hover:bg-white/80 text-(--ink-muted)')}
                >
                  폴링 중지
                </button>
              </div>
              {Object.entries(queueStatus).map(([accountId, status]) => {
                const total = status.waiting + status.active + status.completed + status.failed;
                if (total === 0) return null;
                const progress = total > 0 ? ((status.completed + status.failed) / total) * 100 : 0;
                return (
                  <div key={accountId} className={cn('rounded-xl bg-white/50 p-2')}>
                    <div className={cn('flex items-center justify-between text-xs mb-1')}>
                      <span className={cn('font-medium text-(--ink)')}>{accountId}</span>
                      <span className={cn('text-(--ink-muted)')}>
                        {status.completed}/{total} 완료
                        {status.failed > 0 && ` (${status.failed} 실패)`}
                      </span>
                    </div>
                    <div className={cn('h-1.5 rounded-full bg-gray-200 overflow-hidden')}>
                      <div
                        className={cn('h-full bg-(--accent) transition-all')}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    {status.active > 0 && (
                      <p className={cn('text-xs text-(--accent) mt-1')}>
                        {status.active}개 처리 중...
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
