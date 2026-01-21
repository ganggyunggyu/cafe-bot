'use client';

import { ReactNode } from 'react';
import { Provider as JotaiProvider } from 'jotai';
import { AuthGuard } from '@/features/auth/auth-guard';

interface ProvidersProps {
  children: ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => {
  return (
    <JotaiProvider>
      <AuthGuard>{children}</AuthGuard>
    </JotaiProvider>
  );
};
