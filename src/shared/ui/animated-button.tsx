'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/cn';

interface AnimatedButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  children: React.ReactNode;
}

export const AnimatedButton = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  onClick,
  type = 'button',
  children,
}: AnimatedButtonProps) => {
  const variants = {
    primary: 'bg-(--accent) text-(--background) hover:bg-(--accent-hover)',
    secondary: 'bg-(--surface) border border-(--border) text-(--ink) hover:bg-(--surface-muted)',
    ghost: 'text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)',
    danger: 'bg-(--danger) text-(--background) hover:bg-(--danger)/90',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-5 py-2.5 text-sm rounded-xl',
    lg: 'px-6 py-4 text-base rounded-xl',
  };

  return (
    <motion.button
      whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      disabled={disabled || isLoading}
      className={cn(
        'font-semibold transition-colors relative overflow-hidden',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      onClick={onClick}
      type={type}
    >
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn('flex items-center justify-center gap-2')}
          >
            <motion.span
              className={cn('w-4 h-4 border-2 border-current/30 border-t-current rounded-full')}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
            <span>처리 중...</span>
          </motion.span>
        ) : (
          <motion.span
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};
