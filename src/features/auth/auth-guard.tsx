'use client';

import { useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAtom } from 'jotai';
import { userAtom, userLoadingAtom, userInitializedAtom } from '@/shared/store';
import { getCurrentUser } from './actions';
import { cn } from '@/shared/lib/cn';

const PUBLIC_PATHS = ['/login'];

interface AuthGuardProps {
  children: ReactNode;
}

export const AuthGuard = ({ children }: AuthGuardProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useAtom(userAtom);
  const [isLoading, setIsLoading] = useAtom(userLoadingAtom);
  const [isInitialized, setIsInitialized] = useAtom(userInitializedAtom);

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  useEffect(() => {
    if (isInitialized) return;

    getCurrentUser().then((u) => {
      setUser(u);
      setIsLoading(false);
      setIsInitialized(true);
    });
  }, [isInitialized, setUser, setIsLoading, setIsInitialized]);

  useEffect(() => {
    if (!isInitialized || isLoading) return;

    if (!user && !isPublicPath) {
      router.replace('/login');
    }
  }, [user, isInitialized, isLoading, isPublicPath, router]);

  if (!isInitialized || isLoading) {
    return (
      <div className={cn('min-h-screen flex items-center justify-center bg-background')}>
        <div className={cn('text-ink-muted text-sm')}>로딩 중...</div>
      </div>
    );
  }

  if (!user && !isPublicPath) {
    return null;
  }

  return <>{children}</>;
};
