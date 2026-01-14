'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { runBatchPostAction, runModifyBatchAction, getQueueStatusAction, type QueueStatusResult } from './batch-actions';
import { PostOptionsUI } from './post-options-ui';
import { QueueStatusUI } from './queue-status-ui';
import { getCafesAction } from '@/features/accounts/actions';
import type { CafeConfig } from '@/entities/cafe';
import type { PostOptions } from './types';
import { DEFAULT_POST_OPTIONS } from './types';
import type { ModifyBatchResult, SortOrder } from './modify-batch-job';
import type { QueueBatchResult } from './batch-queue';

type JobMode = 'publish' | 'modify';

const parseLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export function BatchUI() {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<JobMode>('publish');
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
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

  const isPublishMode = mode === 'publish';
  const selectedCafe = cafes.find((cafe) => cafe.cafeId === selectedCafeId);

  // 카페 데이터 로드
  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      const cafeList = data.map((c) => ({
        cafeId: c.cafeId,
        menuId: c.menuId,
        name: c.name,
        categories: c.categories || [],
        isDefault: c.isDefault,
        categoryMenuIds: c.categoryMenuIds,
      }));
      setCafes(cafeList);
      const defaultCafe = cafeList.find((c) => c.isDefault) || cafeList[0];
      if (defaultCafe && !selectedCafeId) {
        setSelectedCafeId(defaultCafe.cafeId);
      }
    };
    loadCafes();
  }, []);

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

  const clearResults = () => {
    setResult(null);
    setModifyResult(null);
  };

  const handlePublishSubmit = () => {
    const keywords = parseLines(keywordsText);
    if (keywords.length === 0) {
      return;
    }

    startTransition(async () => {
      clearResults();

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
  };

  const handleModifySubmit = () => {
    const adKeywords = parseLines(adKeywordsText);
    if (adKeywords.length === 0) {
      return;
    }

    startTransition(async () => {
      clearResults();

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
  };

  const handleSubmit = () => {
    if (isPublishMode) {
      handlePublishSubmit();
      return;
    }

    handleModifySubmit();
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
    (isPublishMode && !keywordsText.trim()) ||
    (!isPublishMode && !adKeywordsText.trim());

  const submitLabel = isPending
    ? isPublishMode
      ? '발행 중...'
      : '수정 중...'
    : isPublishMode
      ? '배치 발행'
      : '배치 수정';

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
          {isPublishMode ? '배치 자동 포스팅' : '배치 글 수정'}
        </h2>
        <p className={cn('text-sm text-(--ink-muted)')}>
          {isPublishMode
            ? '여러 키워드를 입력하면 계정을 로테이션하며 글 작성 + 댓글 + 대댓글 자동 실행'
            : '발행된 일상글을 광고글로 일괄 수정'}
        </p>
      </div>

      <div className={cn('flex gap-2 rounded-2xl border border-(--border) bg-white/30 p-1')}>
        <button
          onClick={() => setMode('publish')}
          className={toggleClassName(isPublishMode)}
        >
          발행 (새글 작성)
        </button>
        <button
          onClick={() => setMode('modify')}
          className={toggleClassName(!isPublishMode)}
        >
          수정 (광고 전환)
        </button>
      </div>

      <div className={sectionClassName}>
        <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
          {isPublishMode ? '발행 설정' : '수정 설정'}
        </h3>
        <div className={cn('flex flex-col gap-3')}>
          <CafeSelect
            cafes={cafes}
            selectedCafe={selectedCafe}
            selectedCafeId={selectedCafeId}
            inputClassName={inputClassName}
            onChange={setSelectedCafeId}
          />

          {isPublishMode ? (
            <PublishFields
              keywordsText={keywordsText}
              inputClassName={inputClassName}
              postOptions={postOptions}
              onKeywordsChange={setKeywordsText}
              onPostOptionsChange={setPostOptions}
            />
          ) : (
            <ModifyFields
              adKeywordsText={adKeywordsText}
              daysLimit={daysLimit}
              inputClassName={inputClassName}
              sortOrder={sortOrder}
              onAdKeywordsChange={setAdKeywordsText}
              onDaysLimitChange={setDaysLimit}
              onSortOrderChange={setSortOrder}
            />
          )}

          <input
            type="text"
            placeholder="참고 URL (선택)"
            value={ref}
            onChange={(event) => setRef(event.target.value)}
            className={inputClassName}
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
        className={submitButtonClassName}
      >
        {submitLabel}
      </button>

      {result && isPublishMode && (
        <PublishResult
          result={result}
          queueStatus={queueStatus}
          onStopPolling={() => setIsPolling(false)}
        />
      )}

      {modifyResult && !isPublishMode && (
        <ModifyResult
          result={modifyResult}
          selectedCafeId={selectedCafeId}
        />
      )}
    </div>
  );
}

interface CafeSelectProps {
  cafes: CafeConfig[];
  selectedCafeId: string;
  selectedCafe?: CafeConfig;
  inputClassName: string;
  onChange: (cafeId: string) => void;
}

function CafeSelect({
  cafes: cafeList,
  selectedCafeId,
  selectedCafe,
  inputClassName,
  onChange,
}: CafeSelectProps) {
  return (
    <div className={cn('flex flex-col gap-1')}>
      <label className={cn('text-xs font-medium text-(--ink-muted)')}>
        카페 선택
      </label>
      <select
        value={selectedCafeId}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      >
        {cafeList.map((cafe) => (
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
            onClick={() => navigator.clipboard.writeText(selectedCafe.categories.join('\n'))}
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
  );
}

interface PublishFieldsProps {
  keywordsText: string;
  postOptions: PostOptions;
  inputClassName: string;
  onKeywordsChange: (value: string) => void;
  onPostOptionsChange: (options: PostOptions) => void;
}

function PublishFields({
  keywordsText,
  postOptions,
  inputClassName,
  onKeywordsChange,
  onPostOptionsChange,
}: PublishFieldsProps) {
  return (
    <Fragment>
      <textarea
        placeholder="키워드 목록 (한 줄에 하나씩)&#10;카테고리 지정: 키워드:카테고리&#10;예:&#10;제주도 맛집&#10;서울 카페:일상&#10;부산 숙소:광고"
        value={keywordsText}
        onChange={(event) => onKeywordsChange(event.target.value)}
        className={cn(inputClassName, 'min-h-[120px] resize-none')}
        rows={5}
      />
      <p className={cn('text-xs text-(--ink-muted) bg-white/50 rounded-xl px-3 py-2')}>
        카테고리 미지정 시 첫 번째 게시판에 발행됩니다.
      </p>
      <div className={cn('rounded-xl border border-(--border) bg-white/50 p-3')}>
        <PostOptionsUI options={postOptions} onChange={onPostOptionsChange} />
      </div>
    </Fragment>
  );
}

interface ModifyFieldsProps {
  adKeywordsText: string;
  sortOrder: SortOrder;
  daysLimit: number | undefined;
  inputClassName: string;
  onAdKeywordsChange: (value: string) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onDaysLimitChange: (value: number | undefined) => void;
}

function ModifyFields({
  adKeywordsText,
  sortOrder,
  daysLimit,
  inputClassName,
  onAdKeywordsChange,
  onSortOrderChange,
  onDaysLimitChange,
}: ModifyFieldsProps) {
  const handleDaysLimitChange = (value: string) => {
    onDaysLimitChange(value ? Number(value) : undefined);
  };

  return (
    <Fragment>
      <textarea
        placeholder="광고 키워드 목록 (한 줄에 하나씩)&#10;카테고리 변경: 키워드:카테고리&#10;예:&#10;제주도 렌트카 업체 추천:광고&#10;서울 맛집 광고&#10;부산 숙소 추천:광고"
        value={adKeywordsText}
        onChange={(event) => onAdKeywordsChange(event.target.value)}
        className={cn(inputClassName, 'min-h-[120px] resize-none')}
        rows={5}
      />
      <select
        value={sortOrder}
        onChange={(event) => onSortOrderChange(event.target.value as SortOrder)}
        className={inputClassName}
      >
        <option value="oldest">발행원고 선택: 오래된 순</option>
        <option value="newest">발행원고 선택: 최신 순</option>
        <option value="random">발행원고 선택: 랜덤</option>
      </select>
      <select
        value={daysLimit ?? ''}
        onChange={(event) => handleDaysLimitChange(event.target.value)}
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
    </Fragment>
  );
}

interface PublishResultProps {
  result: QueueBatchResult;
  queueStatus: QueueStatusResult | null;
  onStopPolling: () => void;
}

function PublishResult({ result, queueStatus, onStopPolling }: PublishResultProps) {
  return (
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

      {queueStatus && Object.keys(queueStatus).length > 0 && (
        <QueueStatusUI status={queueStatus} onStopPolling={onStopPolling} />
      )}
    </div>
  );
}

interface ModifyResultProps {
  result: ModifyBatchResult;
  selectedCafeId: string;
}

function ModifyResult({ result, selectedCafeId }: ModifyResultProps) {
  return (
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
          {result.success ? '수정 완료!' : '일부 실패'}
        </h3>
        <span className={cn('text-sm text-(--ink-muted)')}>
          {result.completed}/{result.totalArticles} 성공
        </span>
      </div>

      {result.totalArticles === 0 ? (
        <p className={cn('text-sm text-(--ink-muted)')}>
          수정할 발행원고가 없습니다.
        </p>
      ) : (
        <div className={cn('space-y-2')}>
          {result.results.map((modifyItem, index) => (
            <div
              key={index}
              className={cn(
                'rounded-xl border border-(--border) bg-white/50 px-3 py-2'
              )}
            >
              <div className={cn('flex items-center gap-2')}>
                <span>{modifyItem.success ? '✅' : '❌'}</span>
                <span className={cn('font-medium text-sm text-(--ink)')}>
                  {modifyItem.keyword}
                </span>
                <a
                  href={`https://cafe.naver.com/ca-fe/cafes/${selectedCafeId}/articles/${modifyItem.articleId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-lg',
                    'bg-(--accent-soft) text-(--accent-strong)',
                    'hover:bg-(--accent) hover:text-white transition'
                  )}
                >
                  #{modifyItem.articleId} 보기
                </a>
              </div>
              {modifyItem.error && (
                <p className={cn('text-xs text-(--danger) mt-1')}>
                  {modifyItem.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
