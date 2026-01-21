'use client';

import { cn } from '@/shared/lib/cn';
import { Select, Checkbox } from '@/shared/ui';
import type { PostOptions } from './types';

interface PostOptionsUIProps {
  options: PostOptions;
  onChange: (options: PostOptions) => void;
}

export const PostOptionsUI = ({ options, onChange }: PostOptionsUIProps) => {
  const handleChange = <K extends keyof PostOptions>(key: K, value: PostOptions[K]) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('space-y-3')}>
        <Checkbox
          label="댓글 허용"
          checked={options.allowComment}
          onChange={(e) => handleChange('allowComment', e.target.checked)}
        />

        <Checkbox
          label="스크랩 허용"
          checked={options.allowScrap}
          onChange={(e) => handleChange('allowScrap', e.target.checked)}
        />

        <Checkbox
          label="복사/저장 허용"
          checked={options.allowCopy}
          onChange={(e) => handleChange('allowCopy', e.target.checked)}
        />

        <Checkbox
          label="자동출처 사용"
          checked={options.useAutoSource}
          onChange={(e) => handleChange('useAutoSource', e.target.checked)}
        />

        <div className={cn('space-y-3')}>
          <Checkbox
            label="CCL 사용"
            checked={options.useCcl}
            onChange={(e) => handleChange('useCcl', e.target.checked)}
          />

          {options.useCcl && (
            <div className={cn('ml-8 space-y-3 p-4 rounded-xl bg-surface-muted')}>
              <div className={cn('flex items-center justify-between gap-4')}>
                <span className={cn('text-sm text-ink-muted')}>영리적 이용</span>
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
                <span className={cn('text-sm text-ink-muted')}>콘텐츠 변경</span>
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
