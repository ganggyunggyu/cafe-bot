'use client';

import { useState, useTransition, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select, Button, Checkbox } from '@/shared/ui';
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
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink',
    'placeholder:text-ink-tertiary transition-all',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10'
  );

  const labelClassName = cn('text-sm font-medium text-ink');

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
          <Checkbox
            label="뒤죽박죽 섞기"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
          />
        </div>
      </div>

      <div className={cn('space-y-2')}>
        <label className={labelClassName}>추가 요청 (선택)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 봄철 관련 키워드 위주로, 초보자 타겟으로..."
          rows={2}
          className={cn(inputClassName, 'resize-none')}
        />
      </div>

      <Button
        onClick={handleGenerate}
        disabled={categories.length === 0}
        isLoading={isPending}
        size="lg"
        fullWidth
      >
        {`키워드 ${count}개 생성`}
      </Button>

      {error && (
        <div className={cn('rounded-xl border border-danger/30 bg-danger-soft px-4 py-3')}>
          <p className={cn('text-sm text-danger')}>{error}</p>
        </div>
      )}

      {result && (
        <div className={cn('space-y-4')}>
          <div className={cn('flex items-center justify-between')}>
            <h3 className={cn('text-base font-semibold text-ink')}>
              생성 결과 ({result.length}개)
            </h3>
            <div className={cn('flex gap-2')}>
              <Button variant="secondary" size="xs" onClick={copyKeywordsOnly}>
                키워드만 복사
              </Button>
              <Button variant={copied ? 'teal' : 'primary'} size="xs" onClick={copyToClipboard}>
                {copied ? '복사됨!' : '카테고리 포함 복사'}
              </Button>
            </div>
          </div>
          <div
            className={cn(
              'max-h-[300px] overflow-y-auto rounded-xl border border-border-light bg-surface p-4'
            )}
          >
            <div className={cn('flex flex-wrap gap-2')}>
              {result.map((k, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs',
                    'bg-surface-muted border border-border-light'
                  )}
                >
                  <span className={cn('text-ink')}>{k.keyword}</span>
                  <span className={cn('text-ink-muted')}>:{k.category}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
