'use client';

import { useEffect, useState, useTransition } from 'react';
import { useAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { Select, Button, Checkbox } from '@/shared/ui';
import { toast } from '@/shared/lib/toast';
import { PostOptionsUI } from '@/features/auto-comment/batch/post-options-ui';
import {
  postOptionsAtom,
  cafesAtom,
  selectedCafeIdAtom,
  cafesInitializedAtom,
  selectedCafeAtom,
} from '@/entities/store';
import { getCafesAction } from '@/features/accounts/actions';
import { getDelaySettings } from '@/shared/hooks/use-delay-settings';
import { generateKeywords } from '@/shared/api/keyword-gen-api';
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
  const [isGenerating, startGenerating] = useTransition();
  const [keywords, setKeywords] = useState('');
  const [model, setModel] = useState('');
  const [cafes, setCafes] = useAtom(cafesAtom);
  const [selectedCafeId, setSelectedCafeId] = useAtom(selectedCafeIdAtom);
  const [cafesInitialized, setCafesInitialized] = useAtom(cafesInitializedAtom);
  const selectedCafe = useAtom(selectedCafeAtom)[0];
  const [postOptions, setPostOptions] = useAtom(postOptionsAtom);
  const [result, setResult] = useState<ViralBatchResult | null>(null);

  const [enableImage, setEnableImage] = useState(false);
  const [imageCount, setImageCount] = useState(0);

  // 키워드 생성 상태
  const [showGenerator, setShowGenerator] = useState(false);
  const [genCount, setGenCount] = useState(60);
  const [genShuffle, setGenShuffle] = useState(true);
  const [genNote, setGenNote] = useState('');

  const inputClassName = cn(
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink',
    'placeholder:text-ink-tertiary transition-all',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10'
  );

  const labelClassName = cn('text-sm font-medium text-ink');

  useEffect(() => {
    if (cafesInitialized) return;

    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) {
        setSelectedCafeId(defaultCafe.cafeId);
      }
      setCafesInitialized(true);
    };
    loadCafes();
  }, [cafesInitialized, setCafes, setSelectedCafeId, setCafesInitialized]);

  const categories = selectedCafe?.categories || [];

  const handleGenerateKeywords = () => {
    if (categories.length === 0) {
      toast.warning('카페를 먼저 선택해주세요');
      return;
    }

    startGenerating(async () => {
      const loadingId = toast.loading('키워드 생성 중...');
      try {
        const res = await generateKeywords({
          categories,
          count: genCount,
          shuffle: genShuffle,
          note: genNote.trim() || undefined,
        });

        const formatted = res.keywords.map((k) => `${k.keyword}:${k.category}`).join('\n');
        setKeywords(formatted);
        setShowGenerator(false);
        toast.dismiss(loadingId);
        toast.success(`${res.keywords.length}개 키워드 생성 완료`);
      } catch (err) {
        toast.dismiss(loadingId);
        toast.error('키워드 생성 실패', err instanceof Error ? err.message : undefined);
      }
    });
  };

  const parseKeywords = (): string[] => {
    return keywords
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const handleRun = () => {
    const parsedKeywords = parseKeywords();
    if (parsedKeywords.length === 0) {
      toast.warning('키워드를 입력해주세요');
      return;
    }

    const delaySettings = getDelaySettings();

    startTransition(async () => {
      setResult(null);
      const loadingId = toast.loading(`0/${parsedKeywords.length} 처리 중...`);

      try {
        const response = await fetch('/api/viral/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keywords: parsedKeywords,
            cafeId: selectedCafeId || undefined,
            postOptions,
            model: model || undefined,
            enableImage,
            imageCount: enableImage ? imageCount : 0,
            delays: delaySettings.delays,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error('스트림 연결 실패');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              const current = data.keywordIndex + 1;
              const total = data.totalKeywords;
              toast.loading(`${current}/${total} 처리 중... (${data.currentKeyword})`, { id: loadingId });
            } else if (data.type === 'complete') {
              const res = data.result as ViralBatchResult;
              setResult(res);
              toast.dismiss(loadingId);
              if (res.success) {
                toast.success(`${res.completed}/${res.totalKeywords} 완료`);
              } else {
                toast.warning(`${res.completed}/${res.totalKeywords} 완료 (일부 실패)`);
              }
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      } catch (error) {
        toast.dismiss(loadingId);
        toast.error('배치 실행 실패', error instanceof Error ? error.message : undefined);
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

  return (
    <div className={cn('space-y-6')}>
      {/* 키워드 입력 영역 */}
      <div className={cn('space-y-4')}>
        <div className={cn('flex items-center justify-between')}>
          <label className={labelClassName}>키워드</label>
          <div className={cn('flex items-center gap-2')}>
            {keywordCount > 0 && (
              <span className={cn('text-sm font-medium text-accent')}>{keywordCount}개</span>
            )}
            <Button
              variant={showGenerator ? 'primary' : 'secondary'}
              size="xs"
              onClick={() => setShowGenerator(!showGenerator)}
            >
              {showGenerator ? 'AI 생성 닫기' : 'AI로 생성'}
            </Button>
          </div>
        </div>

        {/* AI 키워드 생성 패널 */}
        <div
          className={cn(
            'grid transition-all duration-300 ease-out',
            showGenerator ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className={cn('overflow-hidden')}>
            <div className={cn('rounded-xl border border-accent/30 bg-accent-soft p-4 space-y-4')}>
              <div className={cn('flex items-center gap-2')}>
                <span className={cn('text-sm font-semibold text-ink')}>AI 키워드 생성</span>
                <span className={cn('text-xs text-ink-muted')}>
                  {categories.length > 0 ? `${categories.join(', ')} 기반` : '카페를 먼저 선택하세요'}
                </span>
              </div>

              <div className={cn('grid grid-cols-2 gap-3')}>
                <div className={cn('space-y-1.5')}>
                  <label className={cn('text-xs font-medium text-ink-muted')}>개수</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={genCount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      if (cleaned === '') return;
                      setGenCount(Math.max(1, Math.min(200, Number(cleaned))));
                    }}
                    className={cn(inputClassName, 'py-2 text-center')}
                  />
                </div>
                <div className={cn('space-y-1.5 flex flex-col justify-end')}>
                  <Checkbox
                    size="sm"
                    label="섞기"
                    checked={genShuffle}
                    onChange={(e) => setGenShuffle(e.target.checked)}
                  />
                </div>
              </div>

              <div className={cn('space-y-1.5')}>
                <label className={cn('text-xs font-medium text-ink-muted')}>추가 요청 (선택)</label>
                <input
                  type="text"
                  value={genNote}
                  onChange={(e) => setGenNote(e.target.value)}
                  placeholder="예: 봄철 관련, 초보자 타겟..."
                  className={cn(inputClassName, 'py-2')}
                />
              </div>

              <Button
                onClick={handleGenerateKeywords}
                disabled={categories.length === 0}
                isLoading={isGenerating}
                fullWidth
              >
                {`${genCount}개 생성하기`}
              </Button>
            </div>
          </div>
        </div>

        {/* 키워드 텍스트 영역 */}
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

      {/* 설정 카드 */}
      <div className={cn('rounded-2xl border border-border-light bg-surface p-6 space-y-5')}>
        <h3 className={cn('text-base font-semibold text-ink')}>설정</h3>

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
          <Checkbox
            label="이미지 생성"
            checked={enableImage}
            onChange={(e) => setEnableImage(e.target.checked)}
          />
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
          <div className={cn('rounded-xl border border-border-light bg-surface-muted p-4')}>
            <PostOptionsUI options={postOptions} onChange={setPostOptions} />
          </div>
        </div>
      </div>

      {/* 키워드 타입 안내 */}
      <div className={cn('rounded-xl border border-info/20 bg-info-soft p-4 space-y-2')}>
        <p className={cn('text-sm font-semibold text-info')}>키워드 자동 분류</p>
        <div className={cn('text-sm text-info/80 space-y-1')}>
          <p><strong>자사 키워드</strong>: 기력보충, 흑염소, 피로회복 등 → 직접 제품 홍보</p>
          <p><strong>타사 키워드</strong>: 경쟁 제품명 → 중립적 질문 후 대안 제시</p>
        </div>
      </div>

      {/* 실행 버튼 */}
      <Button
        onClick={handleRun}
        disabled={keywordCount === 0}
        isLoading={isPending}
        size="lg"
        fullWidth
      >
        바이럴 배치 실행 ({keywordCount}개)
      </Button>

      {/* 결과 */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn('space-y-4')}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className={cn(
                'rounded-xl border p-4',
                result.success
                  ? 'border-success/30 bg-success-soft'
                  : 'border-warning/30 bg-warning-soft'
              )}
            >
              <div className={cn('flex items-center justify-between')}>
                <h4
                  className={cn(
                    'text-base font-semibold',
                    result.success ? 'text-success' : 'text-warning'
                  )}
                >
                  {result.success ? '배치 완료' : '부분 완료'}
                </h4>
                <span className={cn('text-sm text-ink-muted')}>
                  {result.completed}/{result.totalKeywords} 성공
                </span>
              </div>
            </motion.div>

            {/* 개별 결과 */}
            <div className={cn('space-y-2')}>
              {result.results.map((r, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    'rounded-xl border p-4',
                    r.success
                      ? 'border-success/20 bg-success-soft'
                      : 'border-danger/20 bg-danger-soft'
                  )}
                >
                  <div className={cn('flex items-center justify-between')}>
                    <div className={cn('flex items-center gap-2')}>
                      <span
                        className={cn(
                          'text-sm font-semibold px-2.5 py-1 rounded-lg',
                          r.success ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
                        )}
                      >
                        {r.keyword}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-md font-medium',
                          r.keywordType === 'own'
                            ? 'text-info bg-info/10'
                            : 'text-warning bg-warning/10'
                        )}
                      >
                        {r.keywordType === 'own' ? '자사' : '타사'}
                      </span>
                    </div>
                    {r.success && (
                      <span className={cn('text-sm text-success')}>
                        댓글 {r.commentCount}개, 대댓글 {r.replyCount}개
                      </span>
                    )}
                  </div>
                  {r.success && r.title && (
                    <p className={cn('text-sm text-success/80 mt-2 truncate')}>{r.title}</p>
                  )}
                  {!r.success && r.error && (
                    <p className={cn('text-sm text-danger/80 mt-2')}>{r.error}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
