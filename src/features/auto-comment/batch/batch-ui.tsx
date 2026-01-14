'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { runBatchPostAction, runModifyBatchAction, getQueueStatusAction, type QueueStatusResult } from './batch-actions';
import { PostOptionsUI } from './post-options-ui';
import { QueueStatusUI } from './queue-status-ui';
import { getAllCafes, getDefaultCafe } from '@/shared/config/cafes';
import type { PostOptions } from './types';
import { DEFAULT_POST_OPTIONS } from './types';
import type { ModifyBatchResult, SortOrder } from './modify-batch-job';
import type { QueueBatchResult } from './batch-queue';

type JobMode = 'publish' | 'modify';

const cafes = getAllCafes();
const defaultCafe = getDefaultCafe();

export function BatchUI() {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<JobMode>('publish');
  const [selectedCafeId, setSelectedCafeId] = useState(defaultCafe?.cafeId || '');
  const [keywordsText, setKeywordsText] = useState('');
  const [ref, setRef] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [daysLimit, setDaysLimit] = useState<number | undefined>(undefined);
  const [adKeywordsText, setAdKeywordsText] = useState('');
  const [result, setResult] = useState<QueueBatchResult | null>(null);
  const [modifyResult, setModifyResult] = useState<ModifyBatchResult | null>(null);
  const [postOptions, setPostOptions] = useState<PostOptions>(DEFAULT_POST_OPTIONS);
  const [queueStatus, setQueueStatus] = useState<QueueStatusResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId);

  // 큐 상태 폴링
  useEffect(() => {
    if (!isPolling) return;

    const poll = async () => {
      const status = await getQueueStatusAction();
      setQueueStatus(status);
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [isPolling]);

  const sectionClassName = cn(
    'rounded-2xl border border-(--border) bg-white/70 p-4 shadow-sm'
  );
  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
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

      if (keywords.length === 0) {
        return;
      }

      startTransition(async () => {
        setResult(null);
        setModifyResult(null);

        const res = await runBatchPostAction({
          service: '일반',
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
    } else {
      const adKeywords = adKeywordsText
        .split('\n')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (adKeywords.length === 0) {
        return;
      }

      startTransition(async () => {
        setResult(null);
        setModifyResult(null);

        const res = await runModifyBatchAction({
          service: '일반',
          adKeywords,
          ref: ref || undefined,
          sortOrder,
          cafeId: selectedCafeId || undefined,
          daysLimit,
        });

        setModifyResult(res);
      });
    }
  };

  const toggleClassName = (isActive: boolean) =>
    cn(
      'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-(--accent) text-white'
        : 'bg-white/50 text-(--ink-muted) hover:bg-white/80'
    );

  const isSubmitDisabled =
    isPending ||
    (mode === 'publish' && !keywordsText.trim()) ||
    (mode === 'modify' && !adKeywordsText.trim());

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.3em] text-(--ink-muted)'
          )}
        >
          Batch Automation
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          {mode === 'publish' ? '배치 자동 포스팅' : '배치 글 수정'}
        </h2>
        <p className={cn('text-sm text-(--ink-muted)')}>
          {mode === 'publish'
            ? '여러 키워드를 입력하면 계정을 로테이션하며 글 작성 + 댓글 + 대댓글 자동 실행'
            : '발행된 일상글을 광고글로 일괄 수정'}
        </p>
      </div>

      {/* 모드 토글 */}
      <div className={cn('flex gap-2 rounded-2xl border border-(--border) bg-white/30 p-1')}>
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
        <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
          {mode === 'publish' ? '발행 설정' : '수정 설정'}
        </h3>
        <div className={cn('flex flex-col gap-3')}>
          {/* 카페 선택 */}
          <div className={cn('flex flex-col gap-1')}>
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
              <div className={cn('flex items-center gap-2')}>
                <p className={cn('text-xs text-(--ink-muted) flex-1')}>
                  카테고리: {selectedCafe.categories.join(', ')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedCafe.categories.join('\n'));
                  }}
                  className={cn(
                    'text-xs px-2 py-1 rounded-lg',
                    'bg-white/50 hover:bg-white/80 text-(--ink-muted) hover:text-(--ink)',
                    'border border-(--border) transition'
                  )}
                >
                  복사
                </button>
              </div>
            )}
          </div>

          {mode === 'publish' && (
            <>
              <textarea
                placeholder="키워드 목록 (한 줄에 하나씩)&#10;카테고리 지정: 키워드:카테고리&#10;예:&#10;제주도 맛집&#10;서울 카페:일상&#10;부산 숙소:광고"
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                className={cn(inputClassName, 'min-h-[120px] resize-none')}
                rows={5}
              />
              <p className={cn('text-xs text-(--ink-muted) bg-white/50 rounded-xl px-3 py-2')}>
                카테고리 미지정 시 첫 번째 게시판에 발행됩니다.
              </p>
              <div className={cn('rounded-xl border border-(--border) bg-white/50 p-3')}>
                <PostOptionsUI options={postOptions} onChange={setPostOptions} />
              </div>
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
              <select
                value={daysLimit ?? ''}
                onChange={(e) => setDaysLimit(e.target.value ? Number(e.target.value) : undefined)}
                className={inputClassName}
              >
                <option value="">발행일 필터: 전체</option>
                <option value="1">발행일 필터: 오늘</option>
                <option value="3">발행일 필터: 3일 이내</option>
                <option value="7">발행일 필터: 7일 이내</option>
                <option value="14">발행일 필터: 14일 이내</option>
                <option value="30">발행일 필터: 30일 이내</option>
              </select>
              <p className={cn('text-xs text-(--ink-muted) bg-white/50 rounded-xl px-3 py-2')}>
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

      {/* 발행 결과 (큐 추가) */}
      {result && mode === 'publish' && (
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
            <QueueStatusUI status={queueStatus} onStopPolling={() => setIsPolling(false)} />
          )}
        </div>
      )}

      {/* 수정 결과 */}
      {modifyResult && mode === 'modify' && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-4',
            modifyResult.success
              ? 'border-(--success) bg-(--success-soft)'
              : 'border-(--danger) bg-(--danger-soft)'
          )}
        >
          <div className={cn('flex items-center justify-between mb-3')}>
            <h3
              className={cn(
                'font-semibold',
                modifyResult.success ? 'text-(--success)' : 'text-(--danger)'
              )}
            >
              {modifyResult.success ? '수정 완료!' : '일부 실패'}
            </h3>
            <span className={cn('text-sm text-(--ink-muted)')}>
              {modifyResult.completed}/{modifyResult.totalArticles} 성공
            </span>
          </div>

          {modifyResult.totalArticles === 0 ? (
            <p className={cn('text-sm text-(--ink-muted)')}>
              수정할 발행원고가 없습니다.
            </p>
          ) : (
            <div className={cn('space-y-2')}>
              {modifyResult.results.map((mr, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border border-(--border) bg-white/50 px-3 py-2'
                  )}
                >
                  <div className={cn('flex items-center gap-2')}>
                    <span>{mr.success ? '✅' : '❌'}</span>
                    <span className={cn('font-medium text-sm text-(--ink)')}>
                      {mr.keyword}
                    </span>
                    <a
                      href={`https://cafe.naver.com/ca-fe/cafes/${selectedCafeId}/articles/${mr.articleId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-lg',
                        'bg-(--accent-soft) text-(--accent-strong)',
                        'hover:bg-(--accent) hover:text-white transition'
                      )}
                    >
                      #{mr.articleId} 보기
                    </a>
                  </div>
                  {mr.error && (
                    <p className={cn('text-xs text-(--danger) mt-1')}>
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
