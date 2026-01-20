'use client';

import { cn } from '@/shared/lib/cn';
import type { PostOptions } from './types';

interface PostOptionsUIProps {
  options: PostOptions;
  onChange: (options: PostOptions) => void;
}

export const PostOptionsUI = ({ options, onChange }: PostOptionsUIProps) => {
  const checkboxClassName = cn(
    'h-4 w-4 rounded border-gray-300 text-(--accent) focus:ring-(--accent)'
  );

  const labelClassName = cn('text-sm text-(--ink)');

  const selectClassName = cn(
    'rounded-lg border border-(--border) bg-white/80 px-2 py-1 text-xs text-(--ink)',
    'focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)'
  );

  const handleChange = <K extends keyof PostOptions>(key: K, value: PostOptions[K]) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className={cn('space-y-3')}>
      <div className={cn('flex items-center justify-between')}>
        <h4 className={cn('text-sm font-semibold text-(--ink)')}>게시 옵션</h4>
        <span className={cn('text-xs text-(--ink-muted)')}>모든 글에 적용</span>
      </div>

      <div className={cn('space-y-2')}>
        <label className={cn('flex items-center gap-2 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.allowComment}
            onChange={(e) => handleChange('allowComment', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>댓글 허용</span>
        </label>

        <label className={cn('flex items-center gap-2 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.allowScrap}
            onChange={(e) => handleChange('allowScrap', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>스크랩 허용</span>
        </label>

        <label className={cn('flex items-center gap-2 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.allowCopy}
            onChange={(e) => handleChange('allowCopy', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>복사/저장 허용</span>
        </label>

        <label className={cn('flex items-center gap-2 cursor-pointer')}>
          <input
            type="checkbox"
            checked={options.useAutoSource}
            onChange={(e) => handleChange('useAutoSource', e.target.checked)}
            className={checkboxClassName}
          />
          <span className={labelClassName}>자동출처 사용</span>
        </label>

        <div className={cn('space-y-2')}>
          <label className={cn('flex items-center gap-2 cursor-pointer')}>
            <input
              type="checkbox"
              checked={options.useCcl}
              onChange={(e) => handleChange('useCcl', e.target.checked)}
              className={checkboxClassName}
            />
            <span className={labelClassName}>CCL 사용</span>
          </label>

          {options.useCcl && (
            <div className={cn('ml-6 space-y-2 p-2 rounded-lg bg-white/50')}>
              <div className={cn('flex items-center justify-between gap-2')}>
                <span className={cn('text-xs text-(--ink-muted)')}>영리적 이용</span>
                <select
                  value={options.cclCommercial}
                  onChange={(e) => handleChange('cclCommercial', e.target.value as 'allow' | 'disallow')}
                  className={selectClassName}
                >
                  <option value="allow">허용</option>
                  <option value="disallow">허용 안 함</option>
                </select>
              </div>

              <div className={cn('flex items-center justify-between gap-2')}>
                <span className={cn('text-xs text-(--ink-muted)')}>콘텐츠 변경</span>
                <select
                  value={options.cclModify}
                  onChange={(e) => handleChange('cclModify', e.target.value as 'allow' | 'same' | 'disallow')}
                  className={selectClassName}
                >
                  <option value="allow">허용</option>
                  <option value="same">동일조건허용</option>
                  <option value="disallow">허용 안 함</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
