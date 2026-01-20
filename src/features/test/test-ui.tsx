'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/ui';
import { runTestAction, runTestBatchAction, type TestType, type ModelType, type TestResult, type TestBatchResult } from './actions';
import { getCafesAction } from '@/features/accounts/actions';
import { generateKeywords, type GeneratedKeyword } from '@/shared/api/keyword-gen-api';

type TestMode = 'single' | 'batch';

const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: 'comment', label: '댓글' },
  { value: 'recomment', label: '대댓글' },
  { value: 'cafe-daily', label: '카페 일상글' },
];

const MODELS: { value: ModelType; label: string }[] = [
  { value: 'chatgpt-4o-latest', label: 'GPT-4o (기본)' },
  { value: 'gpt-5.2-2025-12-11', label: 'GPT-5.2' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { value: 'grok-4-fast-reasoning', label: 'Grok 4' },
];

const PERSONAS = [
  { value: '', label: '없음' },
  { value: 'warm-auntie', label: '따뜻한 이모' },
  { value: 'smart-unnie', label: '똑똒한 언니' },
  { value: 'cute-friend', label: '귀여운 친구' },
  { value: 'calm-expert', label: '차분한 전문가' },
  { value: 'energetic-oppa', label: '활발한 오빠' },
];

interface CafeConfig {
  cafeId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
}

const parseLines = (value: string) =>
  value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

export const TestUI = () => {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<TestMode>('single');
  const [testType, setTestType] = useState<TestType>('comment');
  const [model, setModel] = useState<ModelType>('chatgpt-4o-latest');
  const [personaId, setPersonaId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptsText, setPromptsText] = useState('');
  const [singleResult, setSingleResult] = useState<TestResult | null>(null);
  const [batchResult, setBatchResult] = useState<TestBatchResult | null>(null);

  const isSingleMode = mode === 'single';

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');

  const toggleClassName = (isActive: boolean) =>
    cn(
      'flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all',
      isActive
        ? 'bg-(--accent) text-white'
        : 'bg-(--surface) text-(--ink-muted) hover:bg-(--surface-muted)'
    );

  const clearResults = () => {
    setSingleResult(null);
    setBatchResult(null);
  };

  const handleSingleSubmit = () => {
    if (!prompt.trim()) return;

    startTransition(async () => {
      clearResults();
      const finalPrompt = personaId ? `[페르소나: ${personaId}]\n${prompt}` : prompt;
      const res = await runTestAction({ type: testType, prompt: finalPrompt, model });
      setSingleResult(res);
    });
  };

  const handleBatchSubmit = () => {
    const prompts = parseLines(promptsText);
    if (prompts.length === 0) return;

    startTransition(async () => {
      clearResults();
      const res = await runTestBatchAction({ type: testType, prompts, model, personaId: personaId || undefined });
      setBatchResult(res);
    });
  };

  const handleSubmit = () => {
    if (isSingleMode) {
      handleSingleSubmit();
    } else {
      handleBatchSubmit();
    }
  };

  const isSubmitDisabled =
    isPending ||
    (isSingleMode && !prompt.trim()) ||
    (!isSingleMode && !promptsText.trim());

  const submitLabel = isPending
    ? '테스트 중...'
    : isSingleMode
      ? '테스트 실행'
      : '배치 테스트 실행';

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('flex gap-2 rounded-2xl border border-(--border-light) bg-(--surface) p-1')}>
        <button onClick={() => setMode('single')} className={toggleClassName(isSingleMode)}>
          단일 테스트
        </button>
        <button onClick={() => setMode('batch')} className={toggleClassName(!isSingleMode)}>
          배치 테스트
        </button>
      </div>

      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-5')}>
        <h3 className={cn('text-base font-semibold text-(--ink)')}>테스트 설정</h3>

        <div className={cn('space-y-2')}>
          <label className={labelClassName}>테스트 유형</label>
          <div className={cn('flex gap-2')}>
            {TEST_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTestType(t.value)}
                className={cn(
                  'flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                  testType === t.value
                    ? 'bg-(--accent) text-white'
                    : 'bg-(--surface-muted) text-(--ink-muted) hover:text-(--ink) border border-(--border-light)'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Select
          label="모델 선택"
          value={model}
          onChange={(e) => setModel(e.target.value as ModelType)}
          options={MODELS}
        />

        <Select
          label="페르소나"
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          options={PERSONAS}
        />
      </div>

      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-4')}>
        <h3 className={cn('text-base font-semibold text-(--ink)')}>
          {isSingleMode ? '프롬프트 입력' : '프롬프트 목록 (한 줄에 하나씩)'}
        </h3>

        {isSingleMode ? (
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="테스트할 프롬프트를 입력하세요..."
            rows={6}
            className={cn(inputClassName, 'resize-none')}
          />
        ) : (
          <textarea
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            placeholder={`프롬프트 목록 (한 줄에 하나씩)\n예:\n제주도 맛집 추천해주세요\n서울 카페 어디가 좋아요?\n부산 여행 코스 알려주세요`}
            rows={8}
            className={cn(inputClassName, 'resize-none')}
          />
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
        className={cn(
          'w-full rounded-xl px-6 py-4 text-base font-semibold text-white transition-all',
          'bg-(--accent) hover:bg-(--accent-hover)',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {submitLabel}
      </button>

      {singleResult && isSingleMode && (
        <SingleResultUI result={singleResult} />
      )}

      {batchResult && !isSingleMode && (
        <BatchResultUI result={batchResult} />
      )}
    </div>
  );
}

export const KeywordGeneratorUI = () => {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [count, setCount] = useState(10);
  const [shuffle, setShuffle] = useState(true);
  const [result, setResult] = useState<GeneratedKeyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadCafes = async () => {
      const data = await getCafesAction();
      setCafes(data);
      const defaultCafe = data.find((c) => c.isDefault) || data[0];
      if (defaultCafe) setSelectedCafeId(defaultCafe.cafeId);
    };
    loadCafes();
  }, []);

  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId);
  const categories = selectedCafe?.categories || [];

  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-sm text-(--ink)',
    'placeholder:text-(--ink-tertiary) transition-all',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const labelClassName = cn('text-sm font-medium text-(--ink)');
  const helperClassName = cn('text-xs text-(--ink-muted) mt-1');

  const handleGenerate = () => {
    if (categories.length === 0) {
      setError('카페를 선택해주세요.');
      return;
    }

    startTransition(async () => {
      setError(null);
      setResult(null);
      setCopied(false);

      try {
        const res = await generateKeywords({ categories, count, shuffle });
        setResult(res.keywords);
      } catch (err) {
        setError(err instanceof Error ? err.message : '키워드 생성 실패');
      }
    });
  };

  const copyToClipboard = () => {
    if (!result) return;
    const text = result.map((k) => `${k.keyword}:${k.category}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyKeywordsOnly = () => {
    if (!result) return;
    const text = result.map((k) => k.keyword).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('space-y-6')}>
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

      <div className={cn('grid grid-cols-2 gap-4')}>
        <div className={cn('space-y-2')}>
          <label className={labelClassName}>생성 개수</label>
          <input
            type="text"
            inputMode="numeric"
            value={count}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, '');
              if (cleaned === '') return;
              setCount(Math.max(1, Math.min(200, Number(cleaned))));
            }}
            className={inputClassName}
          />
        </div>
        <div className={cn('space-y-2 flex items-end pb-1')}>
          <label className={cn('flex items-center gap-3 cursor-pointer')}>
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className={cn(
                'w-5 h-5 rounded border-2 border-(--border)',
                'checked:bg-(--accent) checked:border-(--accent)',
                'focus:ring-2 focus:ring-(--accent)/20'
              )}
            />
            <span className={labelClassName}>뒤죽박죽 섞기</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isPending || categories.length === 0}
        className={cn(
          'w-full rounded-xl px-6 py-4 text-base font-semibold text-white transition-all',
          'bg-(--accent) hover:bg-(--accent-hover)',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isPending ? '생성 중...' : `키워드 ${count}개 생성`}
      </button>

      {error && (
        <div className={cn('rounded-xl border border-(--danger)/30 bg-(--danger-soft) px-4 py-3')}>
          <p className={cn('text-sm text-(--danger)')}>{error}</p>
        </div>
      )}

      {result && (
        <div className={cn('space-y-4')}>
          <div className={cn('flex items-center justify-between')}>
            <h3 className={cn('text-base font-semibold text-(--ink)')}>
              생성 결과 ({result.length}개)
            </h3>
            <div className={cn('flex gap-2')}>
              <button
                onClick={copyKeywordsOnly}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium transition-all',
                  'border border-(--border) text-(--ink) hover:bg-(--surface-muted)'
                )}
              >
                키워드만 복사
              </button>
              <button
                onClick={copyToClipboard}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium transition-all',
                  copied
                    ? 'bg-(--success) text-white'
                    : 'bg-(--accent) text-white hover:bg-(--accent-hover)'
                )}
              >
                {copied ? '복사됨!' : '카테고리 포함 복사'}
              </button>
            </div>
          </div>
          <div className={cn('max-h-75 overflow-y-auto rounded-xl border border-(--border-light) bg-(--surface) p-4')}>
            <div className={cn('flex flex-wrap gap-2')}>
              {result.map((k, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs',
                    'bg-(--surface-muted) border border-(--border-light)'
                  )}
                >
                  <span className={cn('text-(--ink)')}>{k.keyword}</span>
                  <span className={cn('text-(--ink-muted)')}>:{k.category}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SingleResultUI = ({ result }: { result: TestResult }) => {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5',
        result.success
          ? 'border-(--success)/30 bg-(--success-soft)'
          : 'border-(--danger)/30 bg-(--danger-soft)'
      )}
    >
      <div className={cn('flex items-center justify-between mb-4')}>
        <h3 className={cn('font-semibold', result.success ? 'text-(--success)' : 'text-(--danger)')}>
          {result.success ? '생성 완료' : '실패'}
        </h3>
        <div className={cn('flex items-center gap-2 text-xs text-(--ink-muted)')}>
          <span>{result.model}</span>
          <span>|</span>
          <span>{result.elapsed.toFixed(2)}s</span>
        </div>
      </div>

      {result.success ? (
        <div className={cn('rounded-xl bg-(--surface) p-4 border border-(--border-light)')}>
          <pre className={cn('text-sm text-(--ink) whitespace-pre-wrap font-sans')}>{result.content}</pre>
        </div>
      ) : (
        <p className={cn('text-sm text-(--danger)')}>{result.error}</p>
      )}

      {result.success && (
        <button
          onClick={() => navigator.clipboard.writeText(result.content)}
          className={cn(
            'mt-4 text-xs px-4 py-2 rounded-lg font-medium transition-all',
            'border border-(--border) bg-(--surface) hover:bg-(--surface-muted)'
          )}
        >
          복사
        </button>
      )}
    </div>
  );
}

const BatchResultUI = ({ result }: { result: TestBatchResult }) => {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5',
        result.success
          ? 'border-(--success)/30 bg-(--success-soft)'
          : 'border-(--danger)/30 bg-(--danger-soft)'
      )}
    >
      <div className={cn('flex items-center justify-between mb-4')}>
        <h3 className={cn('font-semibold', result.success ? 'text-(--success)' : 'text-(--danger)')}>
          {result.success ? '테스트 완료' : '일부 실패'}
        </h3>
        <span className={cn('text-sm text-(--ink-muted)')}>
          {result.completed}/{result.total} 성공
        </span>
      </div>

      <div className={cn('space-y-2 max-h-96 overflow-y-auto')}>
        {result.results.map((r, i) => (
          <div key={i} className={cn('rounded-xl border border-(--border-light) bg-(--surface) px-4 py-3')}>
            <div className={cn('flex items-center gap-2 mb-2')}>
              <span>{r.success ? '✅' : '❌'}</span>
              <span className={cn('text-xs text-(--ink-muted)')}>{r.model} | {r.elapsed.toFixed(2)}s</span>
            </div>
            {r.success ? (
              <p className={cn('text-sm text-(--ink) line-clamp-3')}>{r.content}</p>
            ) : (
              <p className={cn('text-sm text-(--danger)')}>{r.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
