'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { runBatchPostAction, runModifyBatchAction } from './batch-actions';
import type { BatchJobResult, KeywordResult } from './types';
import type { ModifyBatchResult, SortOrder } from './modify-batch-job';

type JobMode = 'publish' | 'modify';

export function BatchUI() {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<JobMode>('publish');
  const [service, setService] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [ref, setRef] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [adKeywordsText, setAdKeywordsText] = useState('');
  const [result, setResult] = useState<BatchJobResult | null>(null);
  const [modifyResult, setModifyResult] = useState<ModifyBatchResult | null>(null);

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
    if (mode === 'publish') {
      const keywords = keywordsText
        .split('\n')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (!service || keywords.length === 0) {
        return;
      }

      startTransition(async () => {
        setResult(null);
        setModifyResult(null);

        const res = await runBatchPostAction({
          service,
          keywords,
          ref: ref || undefined,
        });

        setResult(res);
      });
    } else {
      const adKeywords = adKeywordsText
        .split('\n')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (!service || adKeywords.length === 0) {
        return;
      }

      startTransition(async () => {
        setResult(null);
        setModifyResult(null);

        const res = await runModifyBatchAction({
          service,
          adKeywords,
          ref: ref || undefined,
          sortOrder,
        });

        setModifyResult(res);
      });
    }
  };

  const getStatusIcon = (keywordResult: KeywordResult) => {
    if (!keywordResult.post.success) return '❌';
    const allCommentsSuccess = keywordResult.comments.every((c) => c.success);
    const allRepliesSuccess = keywordResult.replies.every((r) => r.success);
    if (allCommentsSuccess && allRepliesSuccess) return '✅';
    return '⚠️';
  };

  const toggleClassName = (isActive: boolean) =>
    cn(
      'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-[color:var(--accent)] text-white'
        : 'bg-white/50 text-[color:var(--ink-muted)] hover:bg-white/80'
    );

  const isSubmitDisabled =
    isPending ||
    !service ||
    (mode === 'publish' && !keywordsText.trim()) ||
    (mode === 'modify' && !adKeywordsText.trim());

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
          {mode === 'publish' ? '배치 자동 포스팅' : '배치 글 수정'}
        </h2>
        <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
          {mode === 'publish'
            ? '여러 키워드를 입력하면 계정을 로테이션하며 글 작성 + 댓글 + 대댓글 자동 실행'
            : '발행된 일상글을 광고글로 일괄 수정'}
        </p>
      </div>

      {/* 모드 토글 */}
      <div className={cn('flex gap-2 rounded-2xl border border-[color:var(--border)] bg-white/30 p-1')}>
        <button
          onClick={() => setMode('publish')}
          className={toggleClassName(mode === 'publish')}
        >
          발행 (새글 작성)
        </button>
        <button
          onClick={() => setMode('modify')}
          className={toggleClassName(mode === 'modify')}
        >
          수정 (광고 전환)
        </button>
      </div>

      <div className={sectionClassName}>
        <h3 className={cn('text-sm font-semibold text-[color:var(--ink)] mb-3')}>
          {mode === 'publish' ? '발행 설정' : '수정 설정'}
        </h3>
        <div className={cn('flex flex-col gap-3')}>
          <input
            type="text"
            placeholder="서비스 (예: 여행, 맛집)"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className={inputClassName}
          />
          {mode === 'publish' && (
            <>
              <textarea
                placeholder="키워드 목록 (한 줄에 하나씩)&#10;카테고리 지정: 키워드:카테고리&#10;예:&#10;제주도 맛집&#10;서울 카페:일상&#10;부산 숙소:광고"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                className={cn(inputClassName, 'min-h-[120px] resize-none')}
                rows={5}
              />
              <p className={cn('text-xs text-[color:var(--ink-muted)] bg-white/50 rounded-xl px-3 py-2')}>
                카테고리 미지정 시 첫 번째 게시판에 발행됩니다.
              </p>
            </>
          )}
          {mode === 'modify' && (
            <>
              <textarea
                placeholder="광고 키워드 목록 (한 줄에 하나씩)&#10;카테고리 변경: 키워드:카테고리&#10;예:&#10;제주도 렌트카 업체 추천:광고&#10;서울 맛집 광고&#10;부산 숙소 추천:광고"
                value={adKeywordsText}
                onChange={(e) => setAdKeywordsText(e.target.value)}
                className={cn(inputClassName, 'min-h-[120px] resize-none')}
                rows={5}
              />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className={inputClassName}
              >
                <option value="oldest">발행원고 선택: 오래된 순</option>
                <option value="newest">발행원고 선택: 최신 순</option>
                <option value="random">발행원고 선택: 랜덤</option>
              </select>
              <p className={cn('text-xs text-[color:var(--ink-muted)] bg-white/50 rounded-xl px-3 py-2')}>
                입력한 광고 키워드 수만큼 발행원고를 가져와서 수정합니다.
                카테고리 미지정 시 기존 카테고리를 유지합니다.
              </p>
            </>
          )}
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
        disabled={isSubmitDisabled}
        className={submitButtonClassName}
      >
        {isPending
          ? mode === 'publish'
            ? '발행 중...'
            : '수정 중...'
          : mode === 'publish'
            ? '배치 발행'
            : '배치 수정'}
      </button>

      {/* 발행 결과 */}
      {result && mode === 'publish' && (
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

      {/* 수정 결과 */}
      {modifyResult && mode === 'modify' && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-4',
            modifyResult.success
              ? 'border-[color:var(--success)] bg-[color:var(--success-soft)]'
              : 'border-[color:var(--danger)] bg-[color:var(--danger-soft)]'
          )}
        >
          <div className={cn('flex items-center justify-between mb-3')}>
            <h3
              className={cn(
                'font-semibold',
                modifyResult.success ? 'text-[color:var(--success)]' : 'text-[color:var(--danger)]'
              )}
            >
              {modifyResult.success ? '수정 완료!' : '일부 실패'}
            </h3>
            <span className={cn('text-sm text-[color:var(--ink-muted)]')}>
              {modifyResult.completed}/{modifyResult.totalArticles} 성공
            </span>
          </div>

          {modifyResult.totalArticles === 0 ? (
            <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
              수정할 발행원고가 없습니다.
            </p>
          ) : (
            <div className={cn('space-y-2')}>
              {modifyResult.results.map((mr, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border border-[color:var(--border)] bg-white/50 px-3 py-2'
                  )}
                >
                  <div className={cn('flex items-center gap-2')}>
                    <span>{mr.success ? '✅' : '❌'}</span>
                    <span className={cn('font-medium text-sm text-[color:var(--ink)]')}>
                      {mr.keyword}
                    </span>
                    <span className={cn('text-xs text-[color:var(--ink-muted)]')}>
                      (#{mr.articleId})
                    </span>
                  </div>
                  {mr.error && (
                    <p className={cn('text-xs text-[color:var(--danger)] mt-1')}>
                      {mr.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
