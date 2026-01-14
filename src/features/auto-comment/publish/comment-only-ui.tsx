'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { getAllCafes, getDefaultCafe } from '@/shared/config/cafes';
import { runAutoCommentAction } from './actions';
import type { CommentOnlyResult } from './types';

const cafes = getAllCafes();
const defaultCafe = getDefaultCafe();

export function CommentOnlyUI() {
  const [isPending, startTransition] = useTransition();
  const [selectedCafeId, setSelectedCafeId] = useState(defaultCafe?.cafeId || '');
  const [daysLimit, setDaysLimit] = useState<number | ''>(3);
  const [result, setResult] = useState<CommentOnlyResult | null>(null);
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );

  const handleExecute = () => {
    startTransition(async () => {
      setResult(null);
      setPhase('running');
      const res = await runAutoCommentAction(selectedCafeId, daysLimit || 1);
      setResult(res);
      setPhase('done');
    });
  };

  const handleReset = () => {
    setResult(null);
    setPhase('ready');
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>
          Auto Comment Mode
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          댓글 자동 달기
        </h2>
        <p className={cn('text-sm text-(--ink-muted)')}>
          오래된 글에 자동으로 댓글/대댓글 추가
        </p>
      </div>

      {phase === 'ready' && (
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
          </div>

          <div className={cn('space-y-1')}>
            <label className={cn('text-xs font-medium text-(--ink-muted)')}>
              기간 설정 (일)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={daysLimit}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, '');
                if (cleaned === '') {
                  setDaysLimit('');
                } else {
                  setDaysLimit(Math.min(30, Number(cleaned)));
                }
              }}
              onBlur={() => {
                if (daysLimit === '' || daysLimit < 1) {
                  setDaysLimit(1);
                }
              }}
              className={inputClassName}
            />
          </div>

          <div className={cn('rounded-xl bg-white/50 px-4 py-3 space-y-2')}>
            <p className={cn('text-sm font-medium text-(--ink)')}>자동 선택 기준</p>
            <ul className={cn('text-xs text-(--ink-muted) space-y-1')}>
              <li>• 최근 {daysLimit || 1}일 이내 글 중 랜덤 절반 선택</li>
              <li>• 글당 3~15개 작성</li>
              <li>• 대댓글 50% / 댓글 50%</li>
            </ul>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <button
          onClick={handleExecute}
          disabled={isPending}
          className={cn(
            'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
            'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          댓글 자동 달기
        </button>
      )}

      {phase === 'running' && (
        <div className={cn('rounded-2xl border border-(--border) bg-white/50 p-6 text-center')}>
          <div className={cn('animate-spin w-8 h-8 border-2 border-(--accent) border-t-transparent rounded-full mx-auto mb-3')} />
          <p className={cn('text-sm text-(--ink)')}>댓글 작성 중...</p>
          <p className={cn('text-xs text-(--ink-muted) mt-1')}>
            각 글에 댓글/대댓글을 달고 있습니다
          </p>
        </div>
      )}

      {phase === 'done' && result && (
        <>
          <div
            className={cn(
              'rounded-2xl border px-4 py-4',
              result.success
                ? 'border-(--success) bg-(--success-soft)'
                : 'border-(--danger) bg-(--danger-soft)'
            )}
          >
            <div className={cn('flex items-center justify-between mb-2')}>
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

            <div className={cn('flex gap-4 mb-3 text-xs text-(--ink-muted) bg-white/30 rounded-lg px-3 py-2')}>
              <span>총 {result.results.reduce((sum, r) => sum + r.commentsAdded, 0)}개 작성</span>
              <span>성공 {result.completed}개</span>
              <span>실패 {result.failed}개</span>
            </div>

            <div className={cn('space-y-2 max-h-[200px] overflow-y-auto')}>
              {result.results.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border border-(--border) bg-white/50 px-3 py-2'
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

          <button
            onClick={handleReset}
            className={cn(
              'w-full rounded-2xl px-4 py-3 text-sm font-semibold transition',
              'bg-white/50 text-(--ink) border border-(--border)',
              'hover:bg-white/80'
            )}
          >
            새로 시작
          </button>
        </>
      )}
    </div>
  );
}
