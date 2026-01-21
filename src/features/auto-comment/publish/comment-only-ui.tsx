'use client';

import { Fragment, useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select, Button } from '@/shared/ui';
import { getCafesAction } from '@/features/accounts/actions';
import { runAutoCommentAction } from './actions';
import type { CommentOnlyResult } from './types';

interface CafeConfig {
  cafeId: string;
  name: string;
  isDefault?: boolean;
}

export const CommentOnlyUI = () => {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');

  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) setSelectedCafeId(defaultCafe.cafeId);
    };
    loadCafes();
  }, []);

  const [daysLimit, setDaysLimit] = useState<number | ''>(3);
  const [result, setResult] = useState<CommentOnlyResult | null>(null);
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const safeDaysLimit = daysLimit || 1;

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');

  const handleExecute = () => {
    startTransition(async () => {
      setResult(null);
      setPhase('running');
      const res = await runAutoCommentAction(selectedCafeId, safeDaysLimit);
      setResult(res);
      setPhase('done');
    });
  };

  const handleReset = () => {
    setResult(null);
    setPhase('ready');
  };

  const handleDaysLimitChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned === '') {
      setDaysLimit('');
      return;
    }
    setDaysLimit(Math.min(30, Number(cleaned)));
  };

  const handleDaysLimitBlur = () => {
    if (daysLimit === '' || daysLimit < 1) {
      setDaysLimit(1);
    }
  };

  return (
    <div className={cn('space-y-6')}>
      {phase === 'ready' && (
        <div className={cn('space-y-4')}>
          <Select
            label="카페 선택"
            value={selectedCafeId}
            onChange={(e) => setSelectedCafeId(e.target.value)}
            options={cafes.map((cafe) => ({
              value: cafe.cafeId,
              label: `${cafe.name}${cafe.isDefault ? ' (기본)' : ''}`,
            }))}
          />

          <div className={cn('space-y-2')}>
            <label className={labelClassName}>기간 설정 (일)</label>
            <input
              type="text"
              inputMode="numeric"
              value={daysLimit}
              onFocus={(e) => e.target.select()}
              onChange={(event) => handleDaysLimitChange(event.target.value)}
              onBlur={handleDaysLimitBlur}
              className={inputClassName}
            />
          </div>

          <div className={cn('rounded-xl border border-(--info)/20 bg-(--info-soft) p-4 space-y-2')}>
            <p className={cn('text-sm font-semibold text-(--info)')}>자동 선택 기준</p>
            <ul className={cn('text-xs text-(--info)/80 space-y-1')}>
              <li>• 최근 {safeDaysLimit}일 이내 글 중 랜덤 절반 선택</li>
              <li>• 글당 3~15개 작성</li>
              <li>• 대댓글 50% / 댓글 50%</li>
            </ul>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <Button
          onClick={handleExecute}
          disabled={isPending}
          size="lg"
          fullWidth
        >
          댓글 자동 달기
        </Button>
      )}

      {phase === 'running' && (
        <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-8 text-center')}>
          <div className={cn('animate-spin w-8 h-8 border-2 border-(--accent) border-t-transparent rounded-full mx-auto mb-4')} />
          <p className={cn('text-sm font-medium text-(--ink)')}>댓글 작성 중...</p>
          <p className={cn('text-xs text-(--ink-muted) mt-1')}>
            각 글에 댓글/대댓글을 달고 있습니다
          </p>
        </div>
      )}

      {phase === 'done' && result && (
        <Fragment>
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
                {result.success ? '완료!' : '일부 실패'}
              </h3>
              <span className={cn('text-sm text-(--ink-muted)')}>
                {result.completed}/{result.totalArticles} 글 처리
              </span>
            </div>

            <div className={cn('flex gap-4 mb-4 text-xs text-(--ink-muted) bg-(--surface)/50 rounded-lg px-4 py-2')}>
              <span>총 {result.results.reduce((sum, r) => sum + r.commentsAdded, 0)}개 작성</span>
              <span>성공 {result.completed}개</span>
              <span>실패 {result.failed}개</span>
            </div>

            <div className={cn('space-y-2 max-h-52 overflow-y-auto')}>
              {result.results.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border border-(--border-light) bg-(--surface) px-4 py-3'
                  )}
                >
                  <div className={cn('flex items-center gap-2')}>
                    <span>{r.success ? '✅' : '❌'}</span>
                    <a
                      href={`https://cafe.naver.com/ca-fe/cafes/${selectedCafeId}/articles/${r.articleId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn('text-xs text-(--accent) hover:underline')}
                    >
                      #{r.articleId} ↗
                    </a>
                    <span className={cn('font-medium text-sm text-(--ink) flex-1')}>
                      {r.keyword}
                    </span>
                    {r.success && (
                      <span className={cn('text-xs text-(--success)')}>
                        +{r.commentsAdded}개
                      </span>
                    )}
                  </div>
                  {r.error && (
                    <p className={cn('text-xs text-(--danger) mt-1')}>{r.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleReset}
          >
            새로 시작
          </Button>
        </Fragment>
      )}
    </div>
  );
};
