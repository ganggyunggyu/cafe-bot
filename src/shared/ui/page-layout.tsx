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
    <div className={cn('min-h-screen relative overflow-hidden bg-(--surface)')}>
      <div
        className={cn(
          'pointer-events-none absolute -top-24 right-[-10%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_65%)] blur-3xl opacity-80'
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute bottom-[-25%] left-[-10%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,var(--teal-soft),transparent_70%)] blur-3xl opacity-70'
        )}
      />

      <AppHeader />

      <main className={cn('relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          {subtitle && (
            <p className={cn('text-xs uppercase tracking-[0.4em] text-(--ink-muted)')}>
              {subtitle}
            </p>
          )}
          <h1
            className={cn(
              'font-(--font-display) text-3xl sm:text-4xl leading-tight text-(--ink)'
            )}
          >
            {title}
          </h1>
          {description && (
            <p className={cn('text-base text-(--ink-muted) max-w-xl')}>{description}</p>
          )}
        </div>

        {children}
      </main>
    </div>
  );
}
