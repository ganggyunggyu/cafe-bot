'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { getAllCafes, getDefaultCafe } from '@/shared/config/cafes';
import { PostOptionsUI } from '../batch/post-options-ui';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '../batch/types';
import { runPostOnlyAction } from './actions';
import type { PostOnlyResult } from './types';

const cafes = getAllCafes();
const defaultCafe = getDefaultCafe();

export function PostOnlyUI() {
  const [isPending, startTransition] = useTransition();
  const [selectedCafeId, setSelectedCafeId] = useState(defaultCafe?.cafeId || '');
  const [keywordsText, setKeywordsText] = useState('');
  const [ref, setRef] = useState('');
  const [postOptions, setPostOptions] = useState<PostOptions>(DEFAULT_POST_OPTIONS);
  const [result, setResult] = useState<PostOnlyResult | null>(null);

  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId);

  const inputClassName = cn(
    'w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] shadow-sm transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]'
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
    });
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]')}>
          Post Only Mode
        </p>
        <h2 className={cn('font-[var(--font-display)] text-xl text-[color:var(--ink)]')}>
          글만 발행
        </h2>
        <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
          댓글 없이 글만 발행 (원고 축적용)
        </p>
      </div>

      <div className={cn('space-y-3')}>
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-[color:var(--ink-muted)]')}>
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
            <p className={cn('text-xs text-[color:var(--ink-muted)]')}>
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

        <div className={cn('rounded-xl border border-[color:var(--border)] bg-white/50 p-3')}>
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
              ? 'border-[color:var(--success)] bg-[color:var(--success-soft)]'
              : 'border-[color:var(--danger)] bg-[color:var(--danger-soft)]'
          )}
        >
          <div className={cn('flex items-center justify-between mb-3')}>
            <h3
              className={cn(
                'font-semibold',
                result.success ? 'text-[color:var(--success)]' : 'text-[color:var(--danger)]'
              )}
            >
              {result.success ? '발행 완료!' : '일부 실패'}
            </h3>
            <span className={cn('text-sm text-[color:var(--ink-muted)]')}>
              {result.completed}/{result.totalKeywords} 성공
            </span>
          </div>

          <div className={cn('space-y-2 max-h-[200px] overflow-y-auto')}>
            {result.results.map((r, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-xl border border-[color:var(--border)] bg-white/50 px-3 py-2'
                )}
              >
                <div className={cn('flex items-center gap-2')}>
                  <span>{r.success ? '✅' : '❌'}</span>
                  <span className={cn('font-medium text-sm text-[color:var(--ink)]')}>
                    {r.keyword}
                  </span>
                  {r.success && r.articleId && (
                    <a
                      href={`https://cafe.naver.com/ca-fe/cafes/${selectedCafeId}/articles/${r.articleId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-lg',
                        'bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]',
                        'hover:bg-[color:var(--accent)] hover:text-white transition'
                      )}
                    >
                      #{r.articleId}
                    </a>
                  )}
                </div>
                {r.error && (
                  <p className={cn('text-xs text-[color:var(--danger)] mt-1')}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
