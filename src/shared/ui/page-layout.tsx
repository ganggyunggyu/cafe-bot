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
    <div className={cn('min-h-screen bg-(--background)')}>
      <AppHeader />

      <main className={cn('max-w-5xl mx-auto px-6 lg:px-8 py-12 lg:py-20')}>
        <div className={cn('mb-12 space-y-3')}>
          {subtitle && (
            <p className={cn('text-sm font-medium text-(--ink-muted)')}>
              {subtitle}
            </p>
          )}
          <h1
            className={cn(
              'text-3xl sm:text-4xl font-bold tracking-tight text-(--ink)'
            )}
          >
            {title}
          </h1>
          {description && (
            <p className={cn('text-lg text-(--ink-muted) max-w-2xl leading-relaxed')}>
              {description}
            </p>
          )}
        </div>

        {children}
      </main>
    </div>
  );
}
