import type { Metadata } from 'next';
import { Fraunces, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { cn } from '@/shared/lib/cn';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

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
    <html lang="ko">
      <body
        className={cn(
          spaceGrotesk.variable,
          fraunces.variable,
          jetBrainsMono.variable,
          'antialiased'
        )}
      >
        {children}
      </body>
    </html>
  );
}
