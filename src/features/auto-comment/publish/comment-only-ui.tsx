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
  const [result, setResult] = useState<CommentOnlyResult | null>(null);
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');

  const inputClassName = cn(
    'w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] shadow-sm transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]'
  );

  const handleExecute = () => {
    startTransition(async () => {
      setResult(null);
      setPhase('running');
      const res = await runAutoCommentAction(selectedCafeId);
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
        <p className={cn('text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]')}>
          Auto Comment Mode
        </p>
        <h2 className={cn('font-[var(--font-display)] text-xl text-[color:var(--ink)]')}>
          댓글 자동 달기
        </h2>
        <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
          오래된 글 중 댓글 적은 것에 자동으로 댓글 추가
        </p>
      </div>

      {phase === 'ready' && (
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
          </div>

          <div className={cn('rounded-xl bg-white/50 px-4 py-3 space-y-2')}>
            <p className={cn('text-sm font-medium text-[color:var(--ink)]')}>자동 선택 기준</p>
            <ul className={cn('text-xs text-[color:var(--ink-muted)] space-y-1')}>
              <li>• 3일 이상 지난 글 중 선택</li>
              <li>• 댓글 5개 이하인 글 우선</li>
              <li>• 랜덤으로 5~10개 선택</li>
              <li>• 각 글에 1~2개 댓글</li>
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

      {phase === 'preview' && previewArticles && (
        <>
          <div
            className={cn(
              'rounded-2xl border border-[color:var(--border)] bg-white/50 p-4 space-y-3'
            )}
          >
            <div className={cn('flex items-center justify-between')}>
              <h3 className={cn('font-semibold text-sm text-[color:var(--ink)]')}>
                댓글 대상 글 미리보기
              </h3>
              <span className={cn('text-xs text-[color:var(--ink-muted)]')}>
                {previewArticles.length}개 선택됨
              </span>
            </div>

            {previewArticles.length === 0 ? (
              <p className={cn('text-sm text-[color:var(--ink-muted)] text-center py-4')}>
                조건에 맞는 글이 없습니다. 필터를 조정해주세요.
              </p>
            ) : (
              <div className={cn('space-y-2 max-h-[200px] overflow-y-auto')}>
                {previewArticles.map((article) => (
                  <div
                    key={article.articleId}
                    className={cn(
                      'rounded-xl border border-[color:var(--border)] bg-white px-3 py-2'
                    )}
                  >
                    <div className={cn('flex items-center gap-2')}>
                      <a
                        href={`https://cafe.naver.com/ca-fe/cafes/${article.cafeId}/articles/${article.articleId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-lg',
                          'bg-[color:var(--accent-soft)] text-[color:var(--accent-strong)]',
                          'hover:bg-[color:var(--accent)] hover:text-white transition'
                        )}
                      >
                        #{article.articleId}
                      </a>
                      <span className={cn('font-medium text-sm text-[color:var(--ink)] flex-1 truncate')}>
                        {article.keyword}
                      </span>
                    </div>
                    <div className={cn('flex items-center gap-3 mt-1 text-xs text-[color:var(--ink-muted)]')}>
                      <span>{formatDate(article.publishedAt)}</span>
                      <span>댓글 {article.commentCount}개</span>
                      <span>{article.writerAccountId}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={cn('flex gap-2')}>
            <button
              onClick={handleReset}
              className={cn(
                'flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                'bg-white/50 text-[color:var(--ink)] border border-[color:var(--border)]',
                'hover:bg-white/80'
              )}
            >
              다시 선택
            </button>
            <button
              onClick={handleExecute}
              disabled={isPending || previewArticles.length === 0}
              className={cn(
                'flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
                'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
                'disabled:cursor-not-allowed disabled:opacity-60'
              )}
            >
              {isPending ? '댓글 작성 중...' : `${previewArticles.length}개 글에 댓글 달기`}
            </button>
          </div>
        </>
      )}

      {phase === 'running' && (
        <div className={cn('rounded-2xl border border-[color:var(--border)] bg-white/50 p-6 text-center')}>
          <div className={cn('animate-spin w-8 h-8 border-2 border-[color:var(--accent)] border-t-transparent rounded-full mx-auto mb-3')} />
          <p className={cn('text-sm text-[color:var(--ink)]')}>댓글 작성 중...</p>
          <p className={cn('text-xs text-[color:var(--ink-muted)] mt-1')}>
            각 글에 1-2개씩 댓글을 달고 있습니다
          </p>
        </div>
      )}

      {phase === 'done' && result && (
        <>
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
                {result.success ? '완료!' : '일부 실패'}
              </h3>
              <span className={cn('text-sm text-[color:var(--ink-muted)]')}>
                {result.completed}/{result.totalArticles} 성공
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
                    <span className={cn('text-xs text-[color:var(--ink-muted)]')}>
                      #{r.articleId}
                    </span>
                    <span className={cn('font-medium text-sm text-[color:var(--ink)] flex-1')}>
                      {r.keyword}
                    </span>
                    {r.success && (
                      <span className={cn('text-xs text-[color:var(--success)]')}>
                        +{r.commentsAdded}개 댓글
                      </span>
                    )}
                  </div>
                  {r.error && (
                    <p className={cn('text-xs text-[color:var(--danger)] mt-1')}>{r.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleReset}
            className={cn(
              'w-full rounded-2xl px-4 py-3 text-sm font-semibold transition',
              'bg-white/50 text-[color:var(--ink)] border border-[color:var(--border)]',
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
