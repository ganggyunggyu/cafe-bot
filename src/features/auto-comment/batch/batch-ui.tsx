'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { runBatchPostAction } from './batch-actions';
import type { BatchJobResult, KeywordResult } from './types';

export function BatchUI() {
  const [isPending, startTransition] = useTransition();
  const [service, setService] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [ref, setRef] = useState('');
  const [result, setResult] = useState<BatchJobResult | null>(null);

  const sectionClassName = cn(
    'rounded-2xl border border-[color:var(--border)] bg-white/70 p-4 shadow-sm'
  );
  const inputClassName = cn(
    'w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] shadow-sm transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]'
  );
  const submitButtonClassName = cn(
    'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );

  const handleSubmit = () => {
    const keywords = keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (!service || keywords.length === 0) {
      return;
    }

    startTransition(async () => {
      setResult(null);

      const res = await runBatchPostAction({
        service,
        keywords,
        ref: ref || undefined,
      });

      setResult(res);
    });
  };

  const getStatusIcon = (keywordResult: KeywordResult) => {
    if (!keywordResult.post.success) return '❌';
    const allCommentsSuccess = keywordResult.comments.every((c) => c.success);
    const allRepliesSuccess = keywordResult.replies.every((r) => r.success);
    if (allCommentsSuccess && allRepliesSuccess) return '✅';
    return '⚠️';
  };

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]'
          )}
        >
          Batch Automation
        </p>
        <h2 className={cn('font-[var(--font-display)] text-xl text-[color:var(--ink)]')}>
          배치 자동 포스팅
        </h2>
        <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
          여러 키워드를 입력하면 계정을 로테이션하며 글 작성 + 댓글 + 대댓글 자동 실행
        </p>
      </div>

      <div className={sectionClassName}>
        <h3 className={cn('text-sm font-semibold text-[color:var(--ink)] mb-3')}>
          배치 설정
        </h3>
        <div className={cn('flex flex-col gap-3')}>
          <input
            type="text"
            placeholder="서비스 (예: 여행, 맛집)"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className={inputClassName}
          />
          <textarea
            placeholder="키워드 목록 (한 줄에 하나씩)&#10;예:&#10;제주도 맛집&#10;서울 카페 추천&#10;부산 해운대"
            value={keywordsText}
            onChange={(e) => setKeywordsText(e.target.value)}
            className={cn(inputClassName, 'min-h-[120px] resize-none')}
            rows={5}
          />
          <input
            type="text"
            placeholder="참고 URL (선택)"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isPending || !service || !keywordsText.trim()}
        className={submitButtonClassName}
      >
        {isPending ? '배치 실행 중...' : '배치 실행'}
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
              {result.success ? '배치 완료!' : '일부 실패'}
            </h3>
            <span className={cn('text-sm text-[color:var(--ink-muted)]')}>
              {result.completed}/{result.totalKeywords} 성공
            </span>
          </div>

          <div className={cn('space-y-2')}>
            {result.results.map((kr, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-xl border border-[color:var(--border)] bg-white/50 px-3 py-2'
                )}
              >
                <div className={cn('flex items-center gap-2 mb-1')}>
                  <span>{getStatusIcon(kr)}</span>
                  <span className={cn('font-medium text-sm text-[color:var(--ink)]')}>
                    {kr.keyword}
                  </span>
                </div>
                <div className={cn('text-xs text-[color:var(--ink-muted)] space-y-0.5')}>
                  <p>
                    글: {kr.post.success ? `성공 (${kr.post.writerAccountId})` : kr.post.error}
                  </p>
                  <p>
                    댓글: {kr.comments.filter((c) => c.success).length}/{kr.comments.length} 성공
                  </p>
                  <p>
                    대댓글: {kr.replies.filter((r) => r.success).length}/{kr.replies.length} 성공
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
