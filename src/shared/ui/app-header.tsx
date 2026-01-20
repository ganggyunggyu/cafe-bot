'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import { ThemeToggle } from './theme-toggle';

const NAV_ITEMS = [
  { href: '/viral', label: '바이럴' },
  { href: '/manual-post', label: '수동 발행' },
  { href: '/publish', label: '분리 발행' },
  { href: '/queue', label: '큐' },
  { href: '/cafe-join', label: '카페 가입' },
  { href: '/nickname-change', label: '닉네임' },
  { href: '/test', label: '테스트' },
  { href: '/accounts', label: '계정' },
  { href: '/settings', label: '설정' },
];

export const AppHeader = () => {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-(--background)/80 backdrop-blur-xl',
        'border-b border-(--border-light)'
      )}
    >
      <div
        className={cn(
          'max-w-5xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between'
        )}
      >
        <Link href="/" className={cn('flex items-center gap-2.5')}>
          <div
            className={cn(
              'h-9 w-9 rounded-xl bg-(--accent) text-white',
              'flex items-center justify-center text-sm font-semibold'
            )}
          >
            CB
          </div>
          <span className={cn('font-semibold text-(--ink)')}>Cafe Bot</span>
        </Link>

        <div className={cn('flex items-center gap-1')}>
          <nav className={cn('flex items-center gap-1')}>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-(--accent) text-white'
                      : 'text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
