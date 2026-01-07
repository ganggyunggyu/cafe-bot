'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { postArticle, type PostArticleResult } from './actions';

export function PostForm() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<PostArticleResult | null>(null);

  const [service, setService] = useState('');
  const [keyword, setKeyword] = useState('');
  const [cafeId, setCafeId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [ref, setRef] = useState('');

  const labelClassName = cn(
    'text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--ink-muted)]'
  );
  const inputClassName = cn(
    'w-full rounded-2xl border border-[color:var(--border)] bg-white/80 px-4 py-3 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] shadow-sm transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]'
  );
  const submitClassName = cn(
    'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const res = await postArticle({
        service,
        keyword,
        cafeId: cafeId || undefined,
        menuId: menuId || undefined,
        ref: ref || undefined,
      });
      setResult(res);
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <label htmlFor="service" className={labelClassName}>
          서비스명 *
        </label>
        <input
          id="service"
          type="text"
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="예: 위고비"
          required
          className={inputClassName}
        />
      </div>

      <div className={cn('space-y-2')}>
        <label htmlFor="keyword" className={labelClassName}>
          키워드 *
        </label>
        <input
          id="keyword"
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="예: 위고비 다이어트 효과 후기"
          required
          className={inputClassName}
        />
      </div>

      <div className={cn('grid gap-4 sm:grid-cols-2')}>
        <div className={cn('space-y-2')}>
          <label htmlFor="cafeId" className={labelClassName}>
            카페 ID (선택)
          </label>
          <input
            id="cafeId"
            type="text"
            value={cafeId}
            onChange={(e) => setCafeId(e.target.value)}
            placeholder="환경변수 사용"
            className={inputClassName}
          />
        </div>

        <div className={cn('space-y-2')}>
          <label htmlFor="menuId" className={labelClassName}>
            메뉴 ID (선택)
          </label>
          <input
            id="menuId"
            type="text"
            value={menuId}
            onChange={(e) => setMenuId(e.target.value)}
            placeholder="환경변수 사용"
            className={inputClassName}
          />
        </div>
      </div>

      <div className={cn('space-y-2')}>
        <label htmlFor="ref" className={labelClassName}>
          참조 원고 (선택)
        </label>
        <textarea
          id="ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="스타일 참조할 원고 내용"
          rows={3}
          className={cn(inputClassName, 'min-h-[120px] resize-none')}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={submitClassName}
      >
        {isPending ? '발행 중...' : '카페에 글 발행'}
      </button>

      {result && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm',
            result.success
              ? 'border-[color:var(--success)] bg-[color:var(--success-soft)] text-[color:var(--success)]'
              : 'border-[color:var(--danger)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]'
          )}
        >
          {result.success ? (
            <div className={cn('space-y-2')}>
              <p className={cn('font-semibold')}>발행 성공!</p>
              {result.articleUrl && (
                <a
                  href={result.articleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--teal)] underline-offset-4 hover:underline'
                  )}
                >
                  게시글 보기
                </a>
              )}
            </div>
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      )}
    </form>
  );
}
