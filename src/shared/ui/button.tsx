'use client';

import { cn } from '@/shared/lib/cn';
import { LoadingDots } from './loading-dots';
import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'teal';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))]',
    'text-background shadow-[0_12px_30px_rgba(0,0,0,0.15)]',
    'hover:brightness-105'
  ),
  secondary: cn(
    'border border-border bg-surface-muted',
    'text-ink hover:bg-surface'
  ),
  ghost: cn(
    'text-ink-muted hover:text-ink hover:bg-surface-muted'
  ),
  danger: cn(
    'bg-danger text-background',
    'shadow-[0_10px_24px_rgba(181,65,50,0.35)]',
    'hover:brightness-105'
  ),
  warning: cn(
    'bg-warning text-background',
    'shadow-[0_10px_24px_rgba(217,119,6,0.35)]',
    'hover:brightness-105'
  ),
  teal: cn(
    'bg-[linear-gradient(135deg,var(--teal),var(--teal-strong))]',
    'text-background shadow-[0_10px_24px_rgba(31,111,103,0.35)]',
    'hover:brightness-105'
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs rounded-lg',
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-2xl',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) => {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'font-semibold transition-all',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <LoadingDots size={size === 'xs' || size === 'sm' ? 'sm' : 'md'} />
      ) : (
        children
      )}
    </button>
  );
};
