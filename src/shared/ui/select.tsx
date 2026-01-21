'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  label?: string;
  helperText?: ReactNode;
  error?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Select = ({
  options,
  value,
  onChange,
  placeholder = '선택하세요',
  label,
  helperText,
  error,
  fullWidth = true,
  disabled = false,
  className,
}: SelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange?.({ target: { value: optionValue } });
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault();
      const currentIndex = options.findIndex((opt) => opt.value === value);
      const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      handleSelect(options[nextIndex].value);
    } else if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      const currentIndex = options.findIndex((opt) => opt.value === value);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      handleSelect(options[prevIndex].value);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', fullWidth && 'w-full')}>
      {label && (
        <label className={cn('block text-sm font-medium text-(--ink) mb-1')}>
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl border bg-(--surface) px-4 py-3 text-sm text-left transition-all',
          'border-(--border) hover:border-(--border-hover)',
          'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10',
          'disabled:bg-(--surface-muted) disabled:cursor-not-allowed disabled:opacity-60',
          isOpen && 'border-(--accent) ring-2 ring-(--accent)/10',
          error && 'border-(--danger) focus:border-(--danger) focus:ring-(--danger)/10',
          fullWidth && 'w-full',
          className
        )}
      >
        <span className={cn(!selectedOption && 'text-(--ink-muted)')}>
          {selectedOption?.label || placeholder}
        </span>
        <svg
          className={cn(
            'w-4 h-4 text-(--ink-muted) transition-transform shrink-0',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-full rounded-xl border border-(--border) bg-(--surface) py-1 shadow-lg',
            'max-h-60 overflow-y-auto'
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={cn(
                'w-full px-4 py-2.5 text-sm text-left transition-colors',
                'hover:bg-(--surface-muted)',
                option.value === value
                  ? 'bg-(--accent-soft) text-(--accent) font-medium'
                  : 'text-(--ink)'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {helperText && !error && (
        <p className={cn('text-xs text-(--ink-muted) mt-1')}>{helperText}</p>
      )}
      {error && (
        <p className={cn('text-xs text-(--danger) mt-1')}>{error}</p>
      )}
    </div>
  );
};
