'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { generateKeywords, type GeneratedKeyword } from '@/shared/api/keyword-gen-api';
import { getCafesAction } from '@/features/accounts/actions';

interface CafeConfig {
  cafeId: string;
  name: string;
  categories: string[];
  isDefault?: boolean;
}

export const KeywordGeneratorUI = () => {
  const [isPending, startTransition] = useTransition();
  const [cafes, setCafes] = useState<CafeConfig[]>([]);
  const [selectedCafeId, setSelectedCafeId] = useState('');
  const [count, setCount] = useState(60);
  const [shuffle, setShuffle] = useState(true);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<GeneratedKeyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 카페 데이터 로딩
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
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
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
        const res = await generateKeywords({
          categories,
          count,
          shuffle,
          note: note.trim() || undefined,
        });

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
          <p className={cn('text-xs text-(--ink-muted)')}>
            카테고리: {selectedCafe.categories.join(', ')}
          </p>
        )}
      </div>

      <div className={cn('grid grid-cols-2 gap-3')}>
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>
            생성 개수
          </label>
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

      <div className={cn('space-y-1')}>
        <label className={cn('text-xs font-medium text-(--ink-muted)')}>
          추가 요청 (선택)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 봄철 관련 키워드 위주로, 초보자 타겟으로..."
          rows={2}
          className={cn(inputClassName, 'resize-none')}
        />
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
          <div
            className={cn(
              'max-h-[300px] overflow-y-auto rounded-xl border border-(--border) bg-white/50 p-3'
            )}
          >
            <div className={cn('flex flex-wrap gap-1.5')}>
              {result.map((k, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs',
                    'bg-white border border-(--border)'
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
};
