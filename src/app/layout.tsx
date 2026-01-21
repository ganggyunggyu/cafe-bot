import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { Providers } from '@/shared/providers';
import './globals.css';

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: 'Cafe Bot - 네이버 카페 자동 글쓰기',
  description: '네이버 카페 자동 글 발행 봇',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={cn(
          jetBrainsMono.variable,
          'antialiased bg-(--background) text-(--foreground)'
        )}
      >
        <Providers>{children}</Providers>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            },
          }}
          richColors
          closeButton
        />
      </body>
    </html>
  );
}
