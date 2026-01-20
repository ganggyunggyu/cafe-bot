'use client';

import { useEffect, useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/ui';
import { runViralBatchAction } from './viral-actions';
import { PostOptionsUI } from '@/features/auto-comment/batch/post-options-ui';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '@/features/auto-comment/batch/types';
import { getCafesAction } from '@/features/accounts/actions';
import { getDelaySettings } from '@/shared/hooks/use-delay-settings';
import type { CafeConfig } from '@/entities/cafe';
import type { ViralBatchResult } from './viral-batch-job';

const MODELS = [
  { value: '', label: '기본 모델' },
  { value: 'chatgpt-4o-latest', label: 'GPT-4o' },
  { value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'grok-4-fast-reasoning', label: 'Grok 4' },
];

export const ViralBatchUI = () => {
  const [isPending, startTransition] = useTransition();
  const [keywords, setKeywords] = useState('');
  const [model, setModel] = useState('');
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [postOptions, setPostOptions] = useState<PostOptions>(DEFAULT_POST_OPTIONS);
  const [result, setResult] = useState<ViralBatchResult | null>(null);

  const [enableImage, setEnableImage] = useState(false);
  const [imageCount, setImageCount] = useState(0);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');
  const helperClassName = cn('text-xs text-(--ink-muted) mt-1');

  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) {
        setSelectedCafeId(defaultCafe.cafeId);
      }
    };
    loadCafes();
  }, []);

  const parseKeywords = (): string[] => {
    return keywords
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const handleRun = () => {
    const parsedKeywords = parseKeywords();
    if (parsedKeywords.length === 0) return;

    const delaySettings = getDelaySettings();

    startTransition(async () => {
      setResult(null);
      try {
        const res = await runViralBatchAction({
          keywords: parsedKeywords,
          cafeId: selectedCafeId || undefined,
          postOptions,
          model: model || undefined,
          enableImage,
          imageCount: enableImage ? imageCount : 0,
          delays: delaySettings.delays,
        });
        setResult(res);
      } catch (error) {
        setResult({
          success: false,
          totalKeywords: parsedKeywords.length,
          completed: 0,
          failed: parsedKeywords.length,
          results: parsedKeywords.map((k) => ({
            keyword: k,
            keywordType: 'own',
            success: false,
            error: error instanceof Error ? error.message : '알 수 없는 오류',
          })),
        });
      }
    });
  };

  const keywordCount = parseKeywords().length;
  const selectedCafe = cafes.find((cafe) => cafe.cafeId === selectedCafeId);

  return (
    <div className={cn('space-y-6')}>
      {/* 키워드 입력 */}
      <div className={cn('space-y-2')}>
        <div className={cn('flex items-center justify-between')}>
          <label className={labelClassName}>
            키워드 입력
          </label>
          {keywordCount > 0 && (
            <span className={cn('text-sm font-medium text-(--accent)')}>{keywordCount}개</span>
          )}
        </div>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={`키워드 또는 키워드:카테고리 (한 줄에 하나씩)

예:
기력보충
수족냉증:건강
흑염소진액 효과:후기`}
          className={cn(inputClassName, 'min-h-36 resize-none font-mono text-xs')}
        />
      </div>

      {/* 설정 카드 */}
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-5')}>
        <h3 className={cn('text-base font-semibold text-(--ink)')}>설정</h3>

        {/* 카페 선택 */}
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

        {/* 모델 선택 */}
        <Select
          label="AI 모델"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          options={MODELS}
        />

        {/* 이미지 생성 옵션 */}
        <div className={cn('space-y-3')}>
          <label className={cn('flex items-center gap-3 cursor-pointer')}>
            <input
              type="checkbox"
              checked={enableImage}
              onChange={(e) => setEnableImage(e.target.checked)}
              className={cn(
                'w-5 h-5 rounded border-2 border-(--border)',
                'checked:bg-(--accent) checked:border-(--accent)',
                'focus:ring-2 focus:ring-(--accent)/20'
              )}
            />
            <span className={labelClassName}>이미지 생성</span>
          </label>
          {enableImage && (
            <div className={cn('flex items-center gap-3 pl-8')}>
              <Select
                label="장수"
                value={String(imageCount)}
                onChange={(e) => setImageCount(Number(e.target.value))}
                options={[
                  { value: '0', label: '랜덤 1~2장' },
                  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                    value: String(n),
                    label: `${n}장`,
                  })),
                ]}
                fullWidth={false}
                className="w-32"
              />
            </div>
          )}
        </div>

        {/* 게시 옵션 */}
        <div className={cn('space-y-3')}>
          <span className={labelClassName}>게시 옵션</span>
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-4')}>
            <PostOptionsUI options={postOptions} onChange={setPostOptions} />
          </div>
        </div>
      </div>

      {/* 키워드 타입 안내 */}
      <div className={cn('rounded-xl border border-(--info)/20 bg-(--info-soft) p-4 space-y-2')}>
        <p className={cn('text-sm font-semibold text-(--info)')}>키워드 자동 분류</p>
        <div className={cn('text-sm text-(--info)/80 space-y-1')}>
          <p><strong>자사 키워드</strong>: 기력보충, 흑염소, 피로회복 등 → 직접 제품 홍보</p>
          <p><strong>타사 키워드</strong>: 경쟁 제품명 → 중립적 질문 후 대안 제시</p>
        </div>
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleRun}
        disabled={isPending || keywordCount === 0}
        className={cn(
          'w-full rounded-xl px-6 py-4 text-base font-semibold text-white transition-all',
          'bg-(--accent) hover:bg-(--accent-hover)',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isPending ? '생성 중...' : `바이럴 배치 실행 (${keywordCount}개)`}
      </button>

      {/* 결과 */}
      {result && (
        <div className={cn('space-y-4')}>
          <div
            className={cn(
              'rounded-xl border p-4',
              result.success
                ? 'border-(--success)/30 bg-(--success-soft)'
                : 'border-(--warning)/30 bg-(--warning-soft)'
            )}
          >
            <div className={cn('flex items-center justify-between')}>
              <h4
                className={cn(
                  'text-base font-semibold',
                  result.success ? 'text-(--success)' : 'text-(--warning)'
                )}
              >
                {result.success ? '배치 완료' : '부분 완료'}
              </h4>
              <span className={cn('text-sm text-(--ink-muted)')}>
                {result.completed}/{result.totalKeywords} 성공
              </span>
            </div>
          </div>

          {/* 개별 결과 */}
          <div className={cn('space-y-2')}>
            {result.results.map((r, idx) => (
              <div
                key={idx}
                className={cn(
                  'rounded-xl border p-4',
                  r.success
                    ? 'border-(--success)/20 bg-(--success-soft)'
                    : 'border-(--danger)/20 bg-(--danger-soft)'
                )}
              >
                <div className={cn('flex items-center justify-between')}>
                  <div className={cn('flex items-center gap-2')}>
                    <span
                      className={cn(
                        'text-sm font-semibold px-2.5 py-1 rounded-lg',
                        r.success ? 'text-(--success) bg-(--success)/10' : 'text-(--danger) bg-(--danger)/10'
                      )}
                    >
                      {r.keyword}
                    </span>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-md font-medium',
                        r.keywordType === 'own'
                          ? 'text-(--info) bg-(--info)/10'
                          : 'text-(--warning) bg-(--warning)/10'
                      )}
                    >
                      {r.keywordType === 'own' ? '자사' : '타사'}
                    </span>
                  </div>
                  {r.success && (
                    <span className={cn('text-sm text-(--success)')}>
                      댓글 {r.commentCount}개, 대댓글 {r.replyCount}개
                    </span>
                  )}
                </div>
                {r.success && r.title && (
                  <p className={cn('text-sm text-(--success)/80 mt-2 truncate')}>{r.title}</p>
                )}
                {!r.success && r.error && (
                  <p className={cn('text-sm text-(--danger)/80 mt-2')}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
