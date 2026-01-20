'use client';

import { cn } from '@/shared/lib/cn';
import { useDelaySettings, type DelaySettings } from '@/shared/hooks/use-delay-settings';

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

const RangeSlider = ({ label, min, max, minValue, maxValue, step, onChange }: RangeSliderProps) => {
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
};

export const DelaySettingsUI = () => {
  const { settings, updateSettings, reset, isLoaded } = useDelaySettings();

  const handleDelayChange = (
    key: 'betweenPosts' | 'betweenComments' | 'afterPost',
    min: number,
    max: number
  ) => {
    const newSettings: DelaySettings = {
      ...settings,
      delays: {
        ...settings.delays,
        [key]: { min, max },
      },
    };
    updateSettings(newSettings);
  };

  if (!isLoaded) {
    return (
      <div className={cn('p-4 text-center text-(--ink-muted)')}>
        로딩 중...
      </div>
    );
  }

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-4')}>
        <div className={cn('flex items-center justify-between')}>
          <h3 className={cn('text-sm font-semibold text-(--ink)')}>딜레이 설정</h3>
          <span className={cn('text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded')}>
            자동 저장
          </span>
        </div>

        <RangeSlider
          label="글 사이 딜레이"
          min={10 * 1000}
          max={5 * 60 * 1000}
          step={5 * 1000}
          minValue={settings.delays.betweenPosts.min}
          maxValue={settings.delays.betweenPosts.max}
          onChange={(min, max) => handleDelayChange('betweenPosts', min, max)}
        />

        <RangeSlider
          label="댓글 사이 딜레이"
          min={1 * 1000}
          max={60 * 1000}
          step={1 * 1000}
          minValue={settings.delays.betweenComments.min}
          maxValue={settings.delays.betweenComments.max}
          onChange={(min, max) => handleDelayChange('betweenComments', min, max)}
        />

        <RangeSlider
          label="글 작성 후 딜레이"
          min={1 * 1000}
          max={60 * 1000}
          step={1 * 1000}
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
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, '');
                if (cleaned === '') return;
                const val = Math.max(1, Math.min(10, Number(cleaned)));
                updateSettings({
                  ...settings,
                  retry: { ...settings.retry, attempts: val },
                });
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
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, '');
                if (cleaned === '') return;
                const val = Math.max(1, Math.min(30, Number(cleaned)));
                updateSettings({ ...settings, timeout: val * 60000 });
              }}
              className={cn(
                'w-full rounded-lg border border-(--border) bg-white/80 px-3 py-2 text-sm'
              )}
            />
          </div>
        </div>
      </div>

      <div className={cn('space-y-4')}>
        <h3 className={cn('text-sm font-semibold text-(--ink)')}>제한 설정</h3>

        <div className={cn('space-y-3')}>
          <label className={cn('flex items-center gap-3 cursor-pointer')}>
            <input
              type="checkbox"
              checked={settings.limits?.enableDailyPostLimit ?? false}
              onChange={(e) => {
                updateSettings({
                  ...settings,
                  limits: { ...settings.limits, enableDailyPostLimit: e.target.checked },
                });
              }}
              className={cn('w-4 h-4 accent-(--accent)')}
            />
            <span className={cn('text-sm text-(--ink)')}>일일 글 제한 활성화</span>
            <span className={cn('text-xs text-(--ink-muted)')}>(계정별 설정 적용)</span>
          </label>

          <div className={cn('flex items-center gap-3')}>
            <span className={cn('text-sm text-(--ink)')}>계정당 댓글 수</span>
            <input
              type="text"
              inputMode="numeric"
              value={settings.limits?.maxCommentsPerAccount ?? 1}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\D/g, '');
                const val = cleaned === '' ? 0 : Math.min(10, Number(cleaned));
                updateSettings({
                  ...settings,
                  limits: { ...settings.limits, maxCommentsPerAccount: val },
                });
              }}
              className={cn(
                'w-16 rounded-lg border border-(--border) bg-white/80 px-3 py-1.5 text-sm text-center'
              )}
            />
            <span className={cn('text-xs text-(--ink-muted)')}>(0 = 무제한)</span>
          </div>
        </div>
      </div>

      <button
        onClick={reset}
        className={cn(
          'w-full rounded-xl px-4 py-2.5 text-sm font-medium border border-(--border)',
          'hover:bg-gray-50 transition'
        )}
      >
        기본값으로 초기화
      </button>
    </div>
  );
};
