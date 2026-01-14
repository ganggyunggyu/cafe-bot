'use client';

import { Fragment, useEffect, useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
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
  { value: 'smart-unnie', label: '똑똑한 언니' },
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

export function TestUI() {
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
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink)',
    'placeholder:text-(--ink-muted) shadow-sm transition',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );

  const toggleClassName = (isActive: boolean) =>
    cn(
      'flex-1 rounded-xl px-4 py-2 text-sm font-medium transition',
      isActive
        ? 'bg-(--accent) text-white'
        : 'bg-white/50 text-(--ink-muted) hover:bg-white/80'
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
      <div className={cn('space-y-2')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>
          API Testing
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          콘텐츠 생성 테스트
        </h2>
        <p className={cn('text-sm text-(--ink-muted)')}>
          프롬프트와 모델을 직접 선택하여 AI 콘텐츠 생성 테스트
        </p>
      </div>

      {/* 단일/배치 모드 토글 */}
      <div className={cn('flex gap-2 rounded-2xl border border-(--border) bg-white/30 p-1')}>
        <button onClick={() => setMode('single')} className={toggleClassName(isSingleMode)}>
          단일 테스트
        </button>
        <button onClick={() => setMode('batch')} className={toggleClassName(!isSingleMode)}>
          배치 테스트
        </button>
      </div>

      {/* 설정 섹션 */}
      <div className={cn('rounded-2xl border border-(--border) bg-white/70 p-4 shadow-sm space-y-3')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>테스트 설정</h3>

        {/* 테스트 타입 */}
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>테스트 유형</label>
          <div className={cn('flex gap-2')}>
            {TEST_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTestType(t.value)}
                className={cn(
                  'flex-1 px-3 py-2 rounded-xl text-sm font-medium transition',
                  testType === t.value
                    ? 'bg-(--accent) text-white'
                    : 'bg-white/50 text-(--ink-muted) hover:bg-white/80 border border-(--border)'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 모델 선택 */}
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>모델 선택</label>
          <select value={model} onChange={(e) => setModel(e.target.value as ModelType)} className={inputClassName}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* 페르소나 선택 */}
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>페르소나</label>
          <select value={personaId} onChange={(e) => setPersonaId(e.target.value)} className={inputClassName}>
            {PERSONAS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 프롬프트 입력 */}
      <div className={cn('rounded-2xl border border-(--border) bg-white/70 p-4 shadow-sm space-y-3')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>
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
            placeholder="프롬프트 목록 (한 줄에 하나씩)&#10;예:&#10;제주도 맛집 추천해주세요&#10;서울 카페 어디가 좋아요?&#10;부산 여행 코스 알려주세요"
            rows={8}
            className={cn(inputClassName, 'resize-none')}
          />
        )}
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
        className={cn(
          'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
          'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        {submitLabel}
      </button>

      {/* 단일 결과 */}
      {singleResult && isSingleMode && (
        <SingleResultUI result={singleResult} />
      )}

      {/* 배치 결과 */}
      {batchResult && !isSingleMode && (
        <BatchResultUI result={batchResult} />
      )}
    </div>
  );
}

// 키워드 생성기 (배치 페이지와 동일)
export function KeywordGeneratorUI() {
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
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink)',
    'placeholder:text-(--ink-muted) shadow-sm transition',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );

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
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-1')}>
        <p className={cn('text-xs uppercase tracking-[0.3em] text-(--ink-muted)')}>
          AI Keyword Generator
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          키워드 생성기
        </h2>
      </div>

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

      <div className={cn('grid grid-cols-2 gap-3')}>
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>생성 개수</label>
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
        <div className={cn('space-y-1 flex items-end')}>
          <label className={cn('flex items-center gap-2 cursor-pointer')}>
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className={cn('w-4 h-4 rounded accent-(--accent)')}
            />
            <span className={cn('text-sm text-(--ink)')}>뒤죽박죽 섞기</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isPending || categories.length === 0}
        className={cn(
          'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
          'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        {isPending ? '생성 중...' : `키워드 ${count}개 생성`}
      </button>

      {error && (
        <div className={cn('rounded-xl border border-(--danger) bg-(--danger-soft) px-4 py-3')}>
          <p className={cn('text-sm text-(--danger)')}>{error}</p>
        </div>
      )}

      {result && (
        <div className={cn('space-y-3')}>
          <div className={cn('flex items-center justify-between')}>
            <h3 className={cn('text-sm font-semibold text-(--ink)')}>
              생성 결과 ({result.length}개)
            </h3>
            <div className={cn('flex gap-2')}>
              <button
                onClick={copyKeywordsOnly}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  'bg-white/50 hover:bg-white/80 text-(--ink) border border-(--border)'
                )}
              >
                키워드만 복사
              </button>
              <button
                onClick={copyToClipboard}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  copied
                    ? 'bg-(--success) text-white'
                    : 'bg-(--accent) text-white hover:brightness-105'
                )}
              >
                {copied ? '복사됨!' : '카테고리 포함 복사'}
              </button>
            </div>
          </div>
          <div className={cn('max-h-[300px] overflow-y-auto rounded-xl border border-(--border) bg-white/50 p-3')}>
            <div className={cn('flex flex-wrap gap-1.5')}>
              {result.map((k, i) => (
                <span
                  key={i}
                  className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-white border border-(--border)')}
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

// 단일 결과 UI
function SingleResultUI({ result }: { result: TestResult }) {
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
        <div className={cn('rounded-xl bg-white/80 p-3')}>
          <pre className={cn('text-sm text-(--ink) whitespace-pre-wrap font-sans')}>{result.content}</pre>
        </div>
      ) : (
        <p className={cn('text-sm text-(--danger)')}>{result.error}</p>
      )}

      {result.success && (
        <button
          onClick={() => navigator.clipboard.writeText(result.content)}
          className={cn('mt-3 text-xs px-3 py-1.5 rounded-lg border border-(--border) bg-white/50 hover:bg-white transition')}
        >
          복사
        </button>
      )}
    </div>
  );
}

// 배치 결과 UI
function BatchResultUI({ result }: { result: TestBatchResult }) {
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
        <h3 className={cn('font-semibold', result.success ? 'text-(--success)' : 'text-(--danger)')}>
          {result.success ? '테스트 완료' : '일부 실패'}
        </h3>
        <span className={cn('text-sm text-(--ink-muted)')}>
          {result.completed}/{result.total} 성공
        </span>
      </div>

      <div className={cn('space-y-2 max-h-[400px] overflow-y-auto')}>
        {result.results.map((r, i) => (
          <div key={i} className={cn('rounded-xl border border-(--border) bg-white/50 px-3 py-2')}>
            <div className={cn('flex items-center gap-2 mb-1')}>
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
