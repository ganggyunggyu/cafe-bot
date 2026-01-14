'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/lib/cn';

const NAV_ITEMS = [
  { href: '/batch', label: '배치 모드' },
  { href: '/publish', label: '분리 발행' },
  { href: '/queue', label: '큐 대시보드' },
  { href: '/cafe-join', label: '카페 가입' },
  { href: '/nickname-change', label: '닉네임 변경' },
  { href: '/test', label: '테스트' },
  { href: '/accounts', label: '계정 관리' },
  { href: '/settings', label: '설정' },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className={cn('relative z-10')}>
      <div
        className={cn(
          'max-w-6xl mx-auto px-6 lg:px-10 py-6 flex flex-wrap items-center justify-between gap-4'
        )}
      >
        <div className={cn('flex items-center gap-3')}>
          <Link href="/" className={cn('flex items-center gap-3')}>
            <div
              className={cn(
                'h-11 w-11 rounded-2xl bg-(--accent) text-white flex items-center justify-center font-semibold'
              )}
            >
              CB
            </div>
            <div className={cn('space-y-1')}>
              <p
                className={cn(
                  'text-[10px] uppercase tracking-[0.35em] text-(--ink-muted)'
                )}
              >
                Automation
              </p>
              <p className={cn('font-(--font-display) text-lg leading-none')}>
                Cafe Bot
              </p>
            </div>
          </Link>
        </div>

        <nav className={cn('flex items-center gap-4')}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return isActive ? (
              <span
                key={item.href}
                className={cn(
                  'text-sm font-semibold text-(--ink) border-b-2 border-(--accent)'
                )}
              >
                {item.label}
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
