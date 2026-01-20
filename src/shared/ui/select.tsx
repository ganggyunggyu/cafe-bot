'use client';

import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  helperText?: ReactNode;
  error?: string;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, label, helperText, error, fullWidth = true, className, ...props }, ref) => {
    const selectClassName = cn(
      'rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--ink)',
      'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10',
      'disabled:bg-(--surface-muted) disabled:cursor-not-allowed',
      'transition-colors',
      fullWidth && 'w-full',
      error && 'border-red-500 focus:border-red-500 focus:ring-red-500/10',
      className
    );

    return (
      <div className={cn('space-y-1', fullWidth && 'w-full')}>
        {label && (
          <label className={cn('block text-sm font-medium text-(--ink)')}>
            {label}
          </label>
        )}
        <select ref={ref} className={selectClassName} {...props}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {helperText && !error && (
          <p className={cn('text-xs text-(--ink-muted)')}>{helperText}</p>
        )}
        {error && (
          <p className={cn('text-xs text-red-500')}>{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
