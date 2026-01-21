'use client';

import { useEffect, useState, useTransition } from 'react';
import { useAtom } from 'jotai';
import { cn } from '@/shared/lib/cn';
import { Select, Button } from '@/shared/ui';
import { runBatchPostAction } from './batch-actions';
import { PostOptionsUI } from './post-options-ui';
import { postOptionsAtom } from '@/entities/store';
import type { QueueBatchResult } from './batch-queue';
import { getCafesAction } from '@/features/accounts/actions';
import type { CafeConfig } from '@/entities/cafe';

type TestType = 'comment' | 'recomment' | 'cafe-daily';

interface TestResult {
  success: boolean;
  content: string;
  model?: string;
  elapsed?: number;
  error?: string;
  keyword?: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_COMMENT_GEN_API_URL || 'http://localhost:8000';

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

const TABS: { key: TestType; label: string; endpoint: string; defaultModel: string }[] = [
  { key: 'cafe-daily', label: '원고', endpoint: '/generate/test/cafe-daily', defaultModel: 'gemini-3-flash-preview' },
  { key: 'comment', label: '댓글', endpoint: '/generate/test/comment', defaultModel: 'chatgpt-4o-latest' },
  { key: 'recomment', label: '대댓글', endpoint: '/generate/test/recomment', defaultModel: 'chatgpt-4o-latest' },
];

export const ApiTestUI = () => {
  const [isPending, startTransition] = useTransition();
  const [isPublishPending, startPublishTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TestType>('cafe-daily');
  const [results, setResults] = useState<TestResult[]>([]);

  // 키워드 입력 (여러 줄)
  const [keywords, setKeywords] = useState('');

  // 각 탭별 기본 프롬프트
  const [dailyPrompt, setDailyPrompt] = useState('');
  const [commentPrompt, setCommentPrompt] = useState('');
  const [recommentPrompt, setRecommentPrompt] = useState('');

  // 모델 선택
  const [model, setModel] = useState('');
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [postOptions, setPostOptions] = useAtom(postOptionsAtom);
  const [ref, setRef] = useState('');
  const [publishResult, setPublishResult] = useState<QueueBatchResult | null>(null);

  const getPrompt = () => {
    if (activeTab === 'cafe-daily') return { prompt: dailyPrompt, setPrompt: setDailyPrompt };
    if (activeTab === 'comment') return { prompt: commentPrompt, setPrompt: setCommentPrompt };
    return { prompt: recommentPrompt, setPrompt: setRecommentPrompt };
  };

  const { prompt, setPrompt } = getPrompt();
  const currentTab = TABS.find((t) => t.key === activeTab)!;
  const selectedCafe = cafes.find((cafe) => cafe.cafeId === selectedCafeId);

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-sm',
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

  // 키워드 파싱 (키워드:카테고리 형식)
  const parseKeywords = () => {
    return keywords
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [keyword, category] = line.split(':').map((s) => s.trim());
        return { keyword, category: category || '' };
      });
  };

  const handleTest = async () => {
    const parsedKeywords = parseKeywords();
    if (parsedKeywords.length === 0 || !prompt.trim()) return;

    setResults([]);
    startTransition(async () => {
      const newResults: TestResult[] = [];

      for (const { keyword, category } of parsedKeywords) {
        try {
          // 기본 프롬프트에 키워드:카테고리 추가
          const fullPrompt = `키워드: ${keyword}${category ? `\n카테고리: ${category}` : ''}\n\n${prompt}`;

          const body: { prompt: string; model?: string } = { prompt: fullPrompt };
          if (model) body.model = model;

          const res = await fetch(`${BASE_URL}${currentTab.endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!res.ok) throw new Error(`API 오류: ${res.status}`);

          const data = await res.json();
          newResults.push({
            success: data.success,
            content: data.comment || data.content || '',
            model: data.model,
            elapsed: data.elapsed,
            keyword: `${keyword}${category ? `:${category}` : ''}`,
          });
        } catch (error) {
          newResults.push({
            success: false,
            content: '',
            error: error instanceof Error ? error.message : '알 수 없는 오류',
            keyword: `${keyword}${category ? `:${category}` : ''}`,
          });
        }
      }

      setResults(newResults);
    });
  };

  const handlePublish = () => {
    const parsedKeywords = parseKeywords();
    if (parsedKeywords.length === 0 || !dailyPrompt.trim()) return;

    startPublishTransition(async () => {
      setPublishResult(null);
      try {
        const keywordsForQueue = parsedKeywords.map(({ keyword, category }) =>
          category ? `${keyword}:${category}` : keyword
        );

        const res = await runBatchPostAction({
          service: '일반',
          keywords: keywordsForQueue,
          ref: ref || undefined,
          cafeId: selectedCafeId || undefined,
          postOptions,
          contentPrompt: dailyPrompt,
          contentModel: model || undefined,
        });

        setPublishResult(res);
      } catch (error) {
        setPublishResult({
          success: false,
          jobsAdded: 0,
          message: error instanceof Error ? error.message : '배치 발행 실패',
        });
      }
    });
  };

  const keywordCount = parseKeywords().length;
  const isPublishDisabled =
    isPublishPending ||
    keywordCount === 0 ||
    !dailyPrompt.trim();

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>API Test</p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>콘텐츠 생성 테스트</h2>
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
          placeholder="키워드:카테고리 (한 줄에 하나씩)&#10;&#10;예:&#10;홍대 카페 추천:자유게시판&#10;강남역 맛집:일상&#10;실내자전거 추천"
          className={cn(inputClassName, 'min-h-24 resize-none font-mono text-xs')}
        />
      </div>

      {/* 탭 */}
      <div className={cn('flex gap-1 p-1 rounded-xl bg-(--surface-muted)')}>
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
            className="flex-1"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* 엔드포인트 표시 */}
      <div className={cn('text-xs text-(--ink-muted) bg-(--surface-muted) px-3 py-2 rounded-lg font-mono')}>
        POST {currentTab.endpoint}
        <span className={cn('ml-2 text-(--ink-tertiary)')}>
          (기본: {MODELS.find((m) => m.value === currentTab.defaultModel)?.label})
        </span>
      </div>

      {/* 기본 프롬프트 입력 */}
      <div>
        <label className={cn('block text-xs font-medium text-(--ink-muted) mb-1')}>
          {activeTab === 'cafe-daily' ? '원고' : activeTab === 'comment' ? '댓글' : '대댓글'} 기본 프롬프트{' '}
          <span className="text-red-400">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            activeTab === 'cafe-daily'
              ? '카페 일상글 작성 지시사항...\n\n예: 위 키워드로 네이버 카페 일상글을 작성해줘. 자연스러운 후기 형태로...'
              : activeTab === 'comment'
                ? '댓글 작성 지시사항...\n\n예: 위 키워드 관련 글에 달 댓글을 작성해줘. 짧고 자연스럽게...'
                : '대댓글 작성 지시사항...\n\n예: 위 키워드 관련 댓글에 달 대댓글을 작성해줘...'
          }
          className={cn(inputClassName, 'min-h-32 resize-none')}
        />
      </div>

      {/* 모델 선택 */}
      <Select
        label="모델"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        options={MODELS}
      />

      {/* 실제 배치 발행 */}
      <div className={cn('rounded-2xl border border-(--border) bg-(--surface-muted) p-4 shadow-sm space-y-3')}>
        <div className={cn('space-y-1')}>
          <p className={cn('text-xs uppercase tracking-[0.2em] text-(--ink-muted)')}>Batch Publish</p>
          <h3 className={cn('text-sm font-semibold text-(--ink)')}>커스텀 프롬프트로 배치 발행</h3>
          <p className={cn('text-xs text-(--ink-muted)')}>
            원고 프롬프트(원고 탭)와 키워드 그대로 큐에 추가합니다.
          </p>
        </div>

        <div className={cn('space-y-2')}>
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

          <div className={cn('space-y-1')}>
            <label className={cn('text-xs font-medium text-(--ink-muted)')}>참고 URL (선택)</label>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="레퍼런스 URL을 넣어주세요"
              className={inputClassName}
            />
          </div>

          <div className={cn('space-y-2')}>
            <div className={cn('flex items-center justify-between')}>
              <span className={cn('text-xs font-medium text-(--ink-muted)')}>게시 옵션</span>
              <span className={cn('text-[11px] text-(--ink-muted)')}>
                원고 프롬프트만 사용, 댓글/대댓글은 기본 로직
              </span>
            </div>
            <div className={cn('rounded-xl border border-(--border) bg-(--surface) p-3')}>
              <PostOptionsUI options={postOptions} onChange={setPostOptions} />
            </div>
          </div>
        </div>

        <Button
          onClick={handlePublish}
          disabled={keywordCount === 0 || !dailyPrompt.trim()}
          isLoading={isPublishPending}
          fullWidth
        >
          {`배치 발행 (키워드 ${keywordCount}개)`}
        </Button>

        {publishResult && (
          <div
            className={cn(
              'rounded-xl border px-3 py-3',
              publishResult.success ? 'border-(--success) bg-(--success-soft)' : 'border-(--danger) bg-(--danger-soft)'
            )}
          >
            <div className={cn('flex items-center justify-between')}>
              <h4 className={cn('text-sm font-semibold', publishResult.success ? 'text-(--success)' : 'text-(--danger)')}>
                {publishResult.success ? '큐에 추가됨' : '추가 실패'}
              </h4>
              <span className={cn('text-xs text-(--ink-muted)')}>{publishResult.jobsAdded}개 작업</span>
            </div>
            <p className={cn('text-xs text-(--ink-muted) mt-1')}>{publishResult.message}</p>
          </div>
        )}
      </div>

      {/* 테스트 버튼 */}
      <Button
        onClick={handleTest}
        disabled={keywordCount === 0 || !prompt.trim()}
        isLoading={isPending}
        variant="secondary"
        fullWidth
      >
        {`테스트 실행 (${keywordCount}개)`}
      </Button>

      {/* 결과 */}
      {results.length > 0 && (
        <div className={cn('space-y-3')}>
          <p className={cn('text-xs font-medium text-(--ink-muted)')}>
            결과 ({results.filter((r) => r.success).length}/{results.length} 성공)
          </p>
          {results.map((result, idx) => (
            <div
              key={idx}
              className={cn(
                'rounded-xl border p-4',
                result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              )}
            >
              {result.success ? (
                <>
                  <div className={cn('flex items-center gap-2 mb-2 flex-wrap')}>
                    <span className={cn('text-xs font-semibold text-green-800 bg-green-100 px-2 py-0.5 rounded')}>
                      {result.keyword}
                    </span>
                    {result.model && (
                      <span className={cn('text-xs text-green-600')}>{result.model}</span>
                    )}
                    {result.elapsed && (
                      <span className={cn('text-xs text-green-500')}>{result.elapsed.toFixed(2)}s</span>
                    )}
                  </div>
                  <pre className={cn('text-sm text-green-800 whitespace-pre-wrap font-sans')}>
                    {result.content}
                  </pre>
                </>
              ) : (
                <div>
                  <span className={cn('text-xs font-semibold text-red-800 bg-red-100 px-2 py-0.5 rounded')}>
                    {result.keyword}
                  </span>
                  <p className={cn('text-sm text-red-700 mt-2')}>{result.error}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
