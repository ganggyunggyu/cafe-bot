import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { DelaySettingsUI } from '@/features/settings/delay-ui';

export default function SettingsPage() {
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
                  Settings
                </p>
                <p className={cn('font-(--font-display) text-lg leading-none')}>
                  Cafe Bot
                </p>
              </div>
            </Link>
          </div>

          <nav className={cn('flex items-center gap-4')}>
            <Link
              href="/batch"
              className={cn(
                'text-sm text-(--ink-muted) hover:text-(--ink)'
              )}
            >
              배치 모드
            </Link>
            <Link
              href="/publish"
              className={cn(
                'text-sm text-(--ink-muted) hover:text-(--ink)'
              )}
            >
              분리 발행
            </Link>
            <Link
              href="/cafe-join"
              className={cn(
                'text-sm text-(--ink-muted) hover:text-(--ink)'
              )}
            >
              카페 가입
            </Link>
            <Link
              href="/accounts"
              className={cn(
                'text-sm text-(--ink-muted) hover:text-(--ink)'
              )}
            >
              계정 관리
            </Link>
            <span
              className={cn(
                'text-sm font-semibold text-(--ink) border-b-2 border-(--accent)'
              )}
            >
              설정
            </span>
          </nav>
        </div>
      </header>

      <main className={cn('relative z-10 max-w-2xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-(--ink-muted)'
            )}
          >
            Queue Settings
          </p>
          <h1
            className={cn(
              'font-(--font-display) text-3xl sm:text-4xl leading-tight text-(--ink)'
            )}
          >
            큐 설정
          </h1>
          <p className={cn('text-base text-(--ink-muted) max-w-xl')}>
            작업 딜레이 및 재시도 설정
          </p>
        </div>

        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <DelaySettingsUI />
        </div>
      </main>
    </div>
  );
}
