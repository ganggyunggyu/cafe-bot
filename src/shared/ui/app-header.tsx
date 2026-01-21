'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/cn';
import { ThemeToggle } from './theme-toggle';
import { getCurrentUser, logout } from '@/features/auth/actions';

// 주요 메뉴
const MAIN_NAV = [
  { href: '/viral', label: '바이럴' },
  { href: '/manual-post', label: '수동' },
  { href: '/publish', label: '분리' },
  { href: '/queue', label: '큐' },
];

// 부가 메뉴
const SUB_NAV = [
  { href: '/cafe-join', label: '가입' },
  { href: '/nickname-change', label: '닉네임' },
  { href: '/accounts', label: '계정' },
  { href: '/settings', label: '설정' },
];

export const AppHeader = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ userId: string; displayName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    router.push('/login');
    router.refresh();
  };

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={cn(
          'px-2.5 py-1.5 rounded-md text-sm font-medium',
          'transition-all duration-200 ease-out',
          isActive
            ? 'bg-(--accent) text-(--background) shadow-sm'
            : 'text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)'
        )}
      >
        {label}
      </Link>
    );
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 bg-(--background)/80 backdrop-blur-xl',
        'border-b border-(--border-light)'
      )}
    >
      <div
        className={cn(
          'max-w-6xl mx-auto px-4 lg:px-6 h-14 flex items-center justify-between'
        )}
      >
        <Link href="/" className={cn('flex items-center gap-2 shrink-0')}>
          <div
            className={cn(
              'h-8 w-8 rounded-lg bg-(--accent) text-(--background)',
              'flex items-center justify-center text-xs font-bold'
            )}
          >
            CB
          </div>
          <span className={cn('font-semibold text-(--ink) hidden sm:block')}>Cafe Bot</span>
        </Link>

        <div className={cn('flex items-center gap-0.5')}>
          {/* 주요 메뉴 */}
          <nav className={cn('flex items-center gap-0.5')}>
            {MAIN_NAV.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>

          {/* 구분선 */}
          <div className={cn('w-px h-4 bg-(--border) mx-2')} />

          {/* 부가 메뉴 */}
          <nav className={cn('flex items-center gap-0.5')}>
            {SUB_NAV.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>

          {/* 구분선 */}
          <div className={cn('w-px h-4 bg-(--border) mx-2')} />

          {/* 우측 영역 - 고정 너비로 레이아웃 시프트 방지 */}
          <div className={cn('flex items-center gap-1')}>
            <ThemeToggle />
            <div className={cn('min-w-[70px] flex justify-end')}>
              {isLoading ? (
                <div className={cn('w-16 h-8')} />
              ) : user ? (
                <button
                  onClick={handleLogout}
                  className={cn(
                    'px-2.5 py-1.5 rounded-md text-sm font-medium',
                    'transition-all duration-200 ease-out',
                    'text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)'
                  )}
                >
                  로그아웃
                </button>
              ) : (
                <Link
                  href="/login"
                  className={cn(
                    'px-2.5 py-1.5 rounded-md text-sm font-medium',
                    'transition-all duration-200 ease-out',
                    'text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)'
                  )}
                >
                  로그인
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
