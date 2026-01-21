'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverScale?: number;
  delay?: number;
}

export const AnimatedCard = ({
  children,
  className,
  onClick,
  hoverScale = 1.01,
  delay = 0,
}: AnimatedCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      whileHover={{
        scale: hoverScale,
        transition: { duration: 0.2 },
      }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-(--border-light) bg-(--surface) p-6',
        'transition-shadow duration-200',
        onClick && 'cursor-pointer hover:shadow-lg hover:shadow-black/5',
        className
      )}
    >
      {children}
    </motion.div>
  );
};

interface AnimatedListItemProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
}

export const AnimatedListItem = ({ children, className, index = 0 }: AnimatedListItemProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
