'use client';

import { cn } from '@/shared/lib/cn';
import type { InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeStyles = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export const Checkbox = ({ size = 'md', label, className, id, ...props }: CheckboxProps) => {
  const checkbox = (
    <input
      type="checkbox"
      id={id}
      className={cn('checkbox', sizeStyles[size], className)}
      {...props}
    />
  );

  if (label) {
    return (
      <label className={cn('flex items-center gap-2 cursor-pointer')} htmlFor={id}>
        {checkbox}
        <span className={cn('text-sm text-ink')}>{label}</span>
      </label>
    );
  }

  return checkbox;
};
