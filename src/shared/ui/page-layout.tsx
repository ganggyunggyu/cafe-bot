import { cn } from '@/shared/lib/cn';
import { AppHeader } from './app-header';

interface PageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  description?: string;
}

export const PageLayout = ({ children, title, subtitle, description }: PageLayoutProps) => {
  return (
    <div className={cn('relative min-h-screen overflow-hidden bg-(--background)')}>
      <div
        aria-hidden
        className={cn('pointer-events-none absolute inset-0 opacity-90')}
        style={{
          backgroundImage: [
            'radial-gradient(circle at top left, color-mix(in srgb, var(--info) 10%, transparent), transparent 34%)',
            'radial-gradient(circle at top right, color-mix(in srgb, var(--success) 10%, transparent), transparent 28%)',
            'linear-gradient(180deg, color-mix(in srgb, var(--surface-muted) 45%, transparent), transparent 26%)',
          ].join(', '),
        }}
      />
      <AppHeader />

      <main className={cn('relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16')}>
        <div className={cn('mb-10 rounded-[32px] border border-(--border-light) bg-(--surface)/90 px-6 py-7 shadow-sm backdrop-blur-sm lg:mb-12 lg:px-8')}>
          {subtitle && (
            <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-(--info)')}>
              {subtitle}
            </p>
          )}
          <h1
            className={cn(
              'mt-2 text-3xl font-bold tracking-tight text-(--ink) sm:text-4xl lg:text-5xl'
            )}
          >
            {title}
          </h1>
          {description && (
            <p className={cn('mt-3 max-w-3xl text-base leading-relaxed text-(--ink-muted) sm:text-lg')}>
              {description}
            </p>
          )}
        </div>

        <div className={cn('relative')}>{children}</div>
      </main>
    </div>
  );
}
