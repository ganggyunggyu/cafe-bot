'use client';

import { useState, useEffect, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { getSettingsAction, updateSettingsAction, resetSettingsAction, QueueSettingsData } from './actions';

// ms를 분:초로 변환
const msToMinSec = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec}초`;
  if (sec === 0) return `${min}분`;
  return `${min}분 ${sec}초`;
};

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  step: number;
  onChange: (min: number, max: number) => void;
}

function RangeSlider({ label, min, max, minValue, maxValue, step, onChange }: RangeSliderProps) {
  return (
    <div className={cn('space-y-2')}>
      <div className={cn('flex justify-between items-center')}>
        <span className={cn('text-sm font-medium text-(--ink)')}>{label}</span>
        <span className={cn('text-xs text-(--ink-muted)')}>
          {msToMinSec(minValue)} ~ {msToMinSec(maxValue)}
        </span>
      </div>
      <div className={cn('flex gap-2 items-center')}>
        <span className={cn('text-xs text-(--ink-muted) w-12')}>최소</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={minValue}
          onChange={(e) => {
            const newMin = Number(e.target.value);
            onChange(Math.min(newMin, maxValue - step), maxValue);
          }}
          className={cn('flex-1 accent-(--accent)')}
        />
      </div>
      <div className={cn('flex gap-2 items-center')}>
        <span className={cn('text-xs text-(--ink-muted) w-12')}>최대</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxValue}
          onChange={(e) => {
            const newMax = Number(e.target.value);
            onChange(minValue, Math.max(newMax, minValue + step));
          }}
          className={cn('flex-1 accent-(--accent)')}
        />
      </div>
    </div>
  );
}

export function DelaySettingsUI() {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<QueueSettingsData | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getSettingsAction();
        setSettings(data);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleDelayChange = (
    key: 'betweenPosts' | 'betweenComments' | 'afterPost',
    min: number,
    max: number
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      delays: {
        ...settings.delays,
        [key]: { min, max },
      },
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!settings) return;
    startTransition(async () => {
      await updateSettingsAction(settings);
      setHasChanges(false);
    });
  };

  const handleReset = () => {
    startTransition(async () => {
      const data = await resetSettingsAction();
      setSettings(data);
      setHasChanges(false);
    });
  };

  if (isLoading || !settings) {
    return (
      <div className={cn('p-4 text-center text-(--ink-muted)')}>
        로딩 중...
      </div>
    );
  }

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-4')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>딜레이 설정</h3>

        <RangeSlider
          label="글 사이 딜레이"
          min={60 * 1000}
          max={15 * 60 * 1000}
          step={30 * 1000}
          minValue={settings.delays.betweenPosts.min}
          maxValue={settings.delays.betweenPosts.max}
          onChange={(min, max) => handleDelayChange('betweenPosts', min, max)}
        />

        <RangeSlider
          label="댓글 사이 딜레이"
          min={10 * 1000}
          max={5 * 60 * 1000}
          step={10 * 1000}
          minValue={settings.delays.betweenComments.min}
          maxValue={settings.delays.betweenComments.max}
          onChange={(min, max) => handleDelayChange('betweenComments', min, max)}
        />

        <RangeSlider
          label="글 작성 후 딜레이"
          min={10 * 1000}
          max={3 * 60 * 1000}
          step={10 * 1000}
          minValue={settings.delays.afterPost.min}
          maxValue={settings.delays.afterPost.max}
          onChange={(min, max) => handleDelayChange('afterPost', min, max)}
        />
      </div>

      <div className={cn('space-y-4')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>재시도 설정</h3>

        <div className={cn('flex gap-4')}>
          <div className={cn('flex-1 space-y-1')}>
            <label className={cn('text-xs text-(--ink-muted)')}>재시도 횟수</label>
            <input
              type="text"
              inputMode="numeric"
              value={settings.retry.attempts}
              onChange={(e) => {
                const val = Number(e.target.value.replace(/\D/g, '')) || 1;
                setSettings({
                  ...settings,
                  retry: { ...settings.retry, attempts: Math.max(1, Math.min(10, val)) },
                });
                setHasChanges(true);
              }}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
              )}
            />
          </div>

          <div className={cn('flex-1 space-y-1')}>
            <label className={cn('text-xs text-(--ink-muted)')}>타임아웃 (분)</label>
            <input
              type="text"
              inputMode="numeric"
              value={Math.floor(settings.timeout / 60000)}
              onChange={(e) => {
                const val = Number(e.target.value.replace(/\D/g, '')) || 1;
                setSettings({ ...settings, timeout: Math.max(1, Math.min(30, val)) * 60000 });
                setHasChanges(true);
              }}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
              )}
            />
          </div>
        </div>
      </div>

      <div className={cn('flex gap-2')}>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isPending}
          className={cn(
            'flex-1 rounded-xl py-2.5 text-sm font-medium transition',
            hasChanges
              ? 'bg-(--accent) text-white hover:opacity-90'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          )}
        >
          {isPending ? '저장 중...' : '저장'}
        </button>

        <button
          onClick={handleReset}
          disabled={isPending}
          className={cn(
            'rounded-xl px-4 py-2.5 text-sm font-medium border border-(--border)',
            'hover:bg-gray-50 transition'
          )}
        >
          초기화
        </button>
      </div>
    </div>
  );
}
