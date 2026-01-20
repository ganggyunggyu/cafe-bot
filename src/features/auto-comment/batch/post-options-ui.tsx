'use client';

import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/ui';
import type { PostOptions } from './types';

interface PostOptionsUIProps {
  options: PostOptions;
  onChange: (options: PostOptions) => void;
}

export const PostOptionsUI = ({ options, onChange }: PostOptionsUIProps) => {
  const checkboxClassName = cn(
    'w-5 h-5 rounded border-2 border-(--border)',
    'checked:bg-(--accent) checked:border-(--accent)',
    'focus:ring-2 focus:ring-(--accent)/20'
  );

  const labelClassName = cn('text-sm text-(--ink)');

  const selectClassName = cn(
    'rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--ink)',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  const handleChange = <K extends keyof PostOptions>(key: K, value: PostOptions[K]) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-3')}>
        <label className={cn('flex items-center gap-3 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.allowComment}
            onChange={(e) => handleChange('allowComment', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>댓글 허용</span>
        </label>

        <label className={cn('flex items-center gap-3 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.allowScrap}
            onChange={(e) => handleChange('allowScrap', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>스크랩 허용</span>
        </label>

        <label className={cn('flex items-center gap-3 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.allowCopy}
            onChange={(e) => handleChange('allowCopy', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>복사/저장 허용</span>
        </label>

        <label className={cn('flex items-center gap-3 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.useAutoSource}
            onChange={(e) => handleChange('useAutoSource', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>자동출처 사용</span>
        </label>

        <div className={cn('space-y-3')}>
          <label className={cn('flex items-center gap-3 cursor-pointer')}>
            <input
              type="checkbox"
              checked={options.useCcl}
              onChange={(e) => handleChange('useCcl', e.target.checked)}
              className={checkboxClassName}
            />
            <span className={labelClassName}>CCL 사용</span>
          </label>

          {options.useCcl && (
            <div className={cn('ml-8 space-y-3 p-4 rounded-xl bg-(--surface-muted)')}>
              <div className={cn('flex items-center justify-between gap-4')}>
                <span className={cn('text-sm text-(--ink-muted)')}>영리적 이용</span>
                <Select
                  value={options.cclCommercial}
                  onChange={(e) => handleChange('cclCommercial', e.target.value as 'allow' | 'disallow')}
                  options={[
                    { value: 'allow', label: '허용' },
                    { value: 'disallow', label: '허용 안 함' },
                  ]}
                  fullWidth={false}
                  className="w-32"
                />
              </div>

              <div className={cn('flex items-center justify-between gap-4')}>
                <span className={cn('text-sm text-(--ink-muted)')}>콘텐츠 변경</span>
                <Select
                  value={options.cclModify}
                  onChange={(e) => handleChange('cclModify', e.target.value as 'allow' | 'same' | 'disallow')}
                  options={[
                    { value: 'allow', label: '허용' },
                    { value: 'same', label: '동일조건허용' },
                    { value: 'disallow', label: '허용 안 함' },
                  ]}
                  fullWidth={false}
                  className="w-32"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
