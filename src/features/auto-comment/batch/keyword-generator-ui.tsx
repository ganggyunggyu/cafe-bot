'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { generateKeywords, type GeneratedKeyword } from '@/shared/api/keyword-gen-api';
import { getAllCafes, getDefaultCafe } from '@/shared/config/cafes';

const cafes = getAllCafes();
const defaultCafe = getDefaultCafe();

export function KeywordGeneratorUI() {
  const [isPending, startTransition] = useTransition();
  const [selectedCafeId, setSelectedCafeId] = useState(defaultCafe?.cafeId || '');
  const [count, setCount] = useState(60);
  const [shuffle, setShuffle] = useState(true);
  const [result, setResult] = useState<GeneratedKeyword[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId);
  const categories = selectedCafe?.categories || [];

  const inputClassName = cn(
    'w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] shadow-sm transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]'
  );

  const handleGenerate = () => {
    if (categories.length === 0) {
      setError('카페를 선택해줘.');
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
        <p className={cn('text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]')}>
          AI Keyword Generator
        </p>
        <h2 className={cn('font-[var(--font-display)] text-xl text-[color:var(--ink)]')}>
          키워드 생성기
        </h2>
      </div>

      <div className={cn('space-y-1')}>
        <label className={cn('text-xs font-medium text-[color:var(--ink-muted)]')}>
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
          <p className={cn('text-xs text-[color:var(--ink-muted)]')}>
            카테고리: {selectedCafe.categories.join(', ')}
          </p>
        )}
      </div>

      <div className={cn('grid grid-cols-2 gap-3')}>
        <div className={cn('space-y-1')}>
          <label className={cn('text-xs font-medium text-[color:var(--ink-muted)]')}>
            생성 개수
          </label>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            min={1}
            max={200}
            className={inputClassName}
          />
        </div>
        <div className={cn('space-y-1 flex items-end')}>
          <label className={cn('flex items-center gap-2 cursor-pointer')}>
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
              className={cn('w-4 h-4 rounded accent-[color:var(--accent)]')}
            />
            <span className={cn('text-sm text-[color:var(--ink)]')}>뒤죽박죽 섞기</span>
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
        <div className={cn('rounded-xl border border-[color:var(--danger)] bg-[color:var(--danger-soft)] px-4 py-3')}>
          <p className={cn('text-sm text-[color:var(--danger)]')}>{error}</p>
        </div>
      )}

      {result && (
        <div className={cn('space-y-3')}>
          <div className={cn('flex items-center justify-between')}>
            <h3 className={cn('text-sm font-semibold text-[color:var(--ink)]')}>
              생성 결과 ({result.length}개)
            </h3>
            <div className={cn('flex gap-2')}>
              <button
                onClick={copyKeywordsOnly}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  'bg-white/50 hover:bg-white/80 text-[color:var(--ink)] border border-[color:var(--border)]'
                )}
              >
                키워드만 복사
              </button>
              <button
                onClick={copyToClipboard}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  copied
                    ? 'bg-[color:var(--success)] text-white'
                    : 'bg-[color:var(--accent)] text-white hover:brightness-105'
                )}
              >
                {copied ? '복사됨!' : '카테고리 포함 복사'}
              </button>
            </div>
          </div>
          <div
            className={cn(
              'max-h-[300px] overflow-y-auto rounded-xl border border-[color:var(--border)] bg-white/50 p-3'
            )}
          >
            <div className={cn('flex flex-wrap gap-1.5')}>
              {result.map((k, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs',
                    'bg-white border border-[color:var(--border)]'
                  )}
                >
                  <span className={cn('text-[color:var(--ink)]')}>{k.keyword}</span>
                  <span className={cn('text-[color:var(--ink-muted)]')}>:{k.category}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
