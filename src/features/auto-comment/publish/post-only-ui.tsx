'use client';

import { useState, useTransition, useEffect } from 'react';
import { useAtom } from 'jotai';
import { cn } from '@/shared/lib/cn';
import { Select, Button } from '@/shared/ui';
import { getCafesAction } from '@/features/accounts/actions';
import { PostOptionsUI } from '../batch/post-options-ui';
import {
  postOptionsAtom,
  cafesAtom,
  selectedCafeIdAtom,
  cafesInitializedAtom,
  selectedCafeAtom,
} from '@/entities/store';
import { runPostOnlyAction, getPostQueueStatusAction, type QueueBatchResult, type QueueStatusResult } from './queue-actions';

export const PostOnlyUI = () => {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useAtom(cafesAtom);
  const [selectedCafeId, setSelectedCafeId] = useAtom(selectedCafeIdAtom);
  const [cafesInitialized, setCafesInitialized] = useAtom(cafesInitializedAtom);
  const selectedCafe = useAtom(selectedCafeAtom)[0];
  const [keywordsText, setKeywordsText] = useState('');
  const [ref, setRef] = useState('');
  const [postOptions, setPostOptions] = useAtom(postOptionsAtom);
  const [result, setResult] = useState<QueueBatchResult | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (cafesInitialized) return;

    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) setSelectedCafeId(defaultCafe.cafeId);
      setCafesInitialized(true);
    };
    loadCafes();
  }, [cafesInitialized, setCafes, setSelectedCafeId, setCafesInitialized]);

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
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');
  const helperClassName = cn('text-xs text-(--ink-muted) mt-1');

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
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-3')}>
        <Select
          label="카페 선택"
          value={selectedCafeId}
          onChange={(e) => setSelectedCafeId(e.target.value)}
          options={cafes.map((cafe) => ({
            value: cafe.cafeId,
            label: `${cafe.name}${cafe.isDefault ? ' (기본)' : ''}`,
          }))}
          helperText={selectedCafe && `카테고리: ${selectedCafe.categories.join(', ')}`}
        />

        <div className={cn('space-y-2')}>
          <label className={labelClassName}>키워드 목록</label>
          <textarea
            placeholder={`키워드 목록 (한 줄에 하나씩)\n카테고리 지정: 키워드:카테고리\n예:\n제주도 맛집\n서울 카페:일상`}
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            className={cn(inputClassName, 'min-h-28 resize-none')}
            rows={4}
          />
        </div>

        <div className={cn('space-y-2')}>
          <label className={labelClassName}>참고 URL (선택)</label>
          <input
            type="text"
            placeholder="참고 URL"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={inputClassName}
          />
        </div>

        <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-4')}>
          <PostOptionsUI options={postOptions} onChange={setPostOptions} />
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!keywordsText.trim()}
        isLoading={isPending}
        size="lg"
        fullWidth
      >
        글만 발행
      </Button>

      {result && (
        <div
          className={cn(
            'rounded-2xl border p-5',
            result.success
              ? 'border-(--success)/30 bg-(--success-soft)'
              : 'border-(--danger)/30 bg-(--danger-soft)'
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

          {queueStatus && Object.keys(queueStatus).length > 0 && (
            <div className={cn('mt-4 space-y-3')}>
              <div className={cn('flex items-center justify-between')}>
                <h4 className={cn('text-sm font-medium text-(--ink)')}>진행 상황</h4>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setIsPolling(false)}
                >
                  폴링 중지
                </Button>
              </div>
              {Object.entries(queueStatus).map(([accountId, status]) => {
                const total = status.waiting + status.active + status.completed + status.failed;
                if (total === 0) return null;
                const progress = total > 0 ? ((status.completed + status.failed) / total) * 100 : 0;
                return (
                  <div key={accountId} className={cn('rounded-xl bg-(--surface) p-3 border border-(--border-light)')}>
                    <div className={cn('flex items-center justify-between text-xs mb-2')}>
                      <span className={cn('font-medium text-(--ink)')}>{accountId}</span>
                      <span className={cn('text-(--ink-muted)')}>
                        {status.completed}/{total} 완료
                        {status.failed > 0 && ` (${status.failed} 실패)`}
                      </span>
                    </div>
                    <div className={cn('h-1.5 rounded-full bg-(--surface-muted) overflow-hidden')}>
                      <div
                        className={cn('h-full bg-(--accent) transition-all')}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    {status.active > 0 && (
                      <p className={cn('text-xs text-(--accent) mt-2')}>
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
};
