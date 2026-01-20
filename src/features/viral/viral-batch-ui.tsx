'use client';

import { useEffect, useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
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

  // 이미지 생성 옵션
  const [enableImage, setEnableImage] = useState(false);
  const [imageCount, setImageCount] = useState(0); // 0 = 랜덤 1~2장

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm',
    'placeholder:text-(--ink-muted) shadow-sm transition',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/20'
  );

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

    // localStorage에서 딜레이 설정 가져오기
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
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>Viral Batch</p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>바이럴 콘텐츠 생성</h2>
        <p className={cn('text-xs text-(--ink-muted)')}>
          AI가 제목, 본문, 댓글, 대댓글을 한 번에 생성하고 자동으로 발행합니다.
        </p>
      </div>

      {/* 키워드 입력 */}
      <div>
        <label className={cn('block text-xs font-medium text-(--ink-muted) mb-1')}>
          키워드 입력 <span className="text-red-400">*</span>
          {keywordCount > 0 && (
            <span className={cn('ml-2 text-(--accent)')}>({keywordCount}개)</span>
          )}
        </label>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={`키워드 또는 키워드:카테고리 (한 줄에 하나씩)

예:
기력보충
수족냉증:건강
흑염소진액 효과:후기`}
          className={cn(inputClassName, 'min-h-32 resize-none font-mono text-xs')}
        />
      </div>

      {/* 설정 섹션 */}
      <div className={cn('rounded-2xl border border-(--border) bg-white/70 p-4 shadow-sm space-y-3')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>설정</h3>

        {/* 카페 선택 */}
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>카페 선택</label>
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
            <p className={cn('text-xs text-(--ink-muted)')}>
              카테고리: {selectedCafe.categories.join(', ')}
            </p>
          )}
        </div>

        {/* 모델 선택 */}
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>AI 모델</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClassName}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 이미지 생성 옵션 */}
        <div className={cn('space-y-2')}>
          <div className={cn('flex items-center gap-2')}>
            <input
              type="checkbox"
              id="enableImage"
              checked={enableImage}
              onChange={(e) => setEnableImage(e.target.checked)}
              className={cn('rounded border-gray-300')}
            />
            <label htmlFor="enableImage" className={cn('text-xs font-medium text-(--ink-muted)')}>
              이미지 생성
            </label>
          </div>
          {enableImage && (
            <div className={cn('flex items-center gap-2 pl-5')}>
              <label className={cn('text-xs text-(--ink-muted)')}>장수:</label>
              <select
                value={imageCount}
                onChange={(e) => setImageCount(Number(e.target.value))}
                className={cn(inputClassName, 'w-28')}
              >
                <option value={0}>랜덤 1~2장</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}장
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 게시 옵션 */}
        <div className={cn('space-y-2')}>
          <span className={cn('text-xs font-medium text-(--ink-muted)')}>게시 옵션</span>
          <div className={cn('rounded-xl border border-(--border) bg-white/80 p-3')}>
            <PostOptionsUI options={postOptions} onChange={setPostOptions} />
          </div>
        </div>
      </div>

      {/* 키워드 타입 설명 */}
      <div className={cn('rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-1')}>
        <p className={cn('text-xs font-semibold text-blue-700')}>키워드 자동 분류</p>
        <p className={cn('text-xs text-blue-600')}>
          • <strong>자사 키워드</strong>: 기력보충, 흑염소, 피로회복 등 → 직접 제품 홍보
        </p>
        <p className={cn('text-xs text-blue-600')}>
          • <strong>타사 키워드</strong>: 경쟁 제품명 → 중립적 질문 후 대안 제시
        </p>
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleRun}
        disabled={isPending || keywordCount === 0}
        className={cn(
          'w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition',
          'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
          'disabled:opacity-60 disabled:cursor-not-allowed'
        )}
      >
        {isPending ? '생성 중...' : `바이럴 배치 실행 (${keywordCount}개)`}
      </button>

      {/* 결과 */}
      {result && (
        <div className={cn('space-y-3')}>
          <div
            className={cn(
              'rounded-xl border px-3 py-3',
              result.success ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
            )}
          >
            <div className={cn('flex items-center justify-between')}>
              <h4
                className={cn(
                  'text-sm font-semibold',
                  result.success ? 'text-green-700' : 'text-amber-700'
                )}
              >
                {result.success ? '배치 완료' : '부분 완료'}
              </h4>
              <span className={cn('text-xs text-(--ink-muted)')}>
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
                  'rounded-lg border px-3 py-2',
                  r.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                )}
              >
                <div className={cn('flex items-center justify-between')}>
                  <div className={cn('flex items-center gap-2')}>
                    <span
                      className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded',
                        r.success ? 'text-green-800 bg-green-100' : 'text-red-800 bg-red-100'
                      )}
                    >
                      {r.keyword}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        r.keywordType === 'own' ? 'text-blue-600 bg-blue-100' : 'text-orange-600 bg-orange-100'
                      )}
                    >
                      {r.keywordType === 'own' ? '자사' : '타사'}
                    </span>
                  </div>
                  {r.success && (
                    <span className={cn('text-xs text-green-600')}>
                      댓글 {r.commentCount}개, 대댓글 {r.replyCount}개
                    </span>
                  )}
                </div>
                {r.success && r.title && (
                  <p className={cn('text-xs text-green-700 mt-1 truncate')}>{r.title}</p>
                )}
                {!r.success && r.error && (
                  <p className={cn('text-xs text-red-600 mt-1')}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
