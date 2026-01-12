import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { AccountListUI } from '@/features/auto-comment/batch';

export default function AccountsPage() {
  return (
    <div className={cn('min-h-screen relative overflow-hidden bg-[var(--surface)]')}>
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
                  'h-11 w-11 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center font-semibold'
                )}
              >
                CB
              </div>
              <div className={cn('space-y-1')}>
                <p
                  className={cn(
                    'text-[10px] uppercase tracking-[0.35em] text-[color:var(--ink-muted)]'
                  )}
                >
                  Account Manager
                </p>
                <p className={cn('font-[var(--font-display)] text-lg leading-none')}>
                  Cafe Bot
                </p>
              </div>
            </Link>
          </div>

          <nav className={cn('flex items-center gap-4')}>
            <Link
              href="/"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              기본 발행
            </Link>
            <Link
              href="/batch"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              배치 모드
            </Link>
            <Link
              href="/cafe-join"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              카페 가입
            </Link>
            <span
              className={cn(
                'text-sm font-semibold text-[color:var(--ink)] border-b-2 border-[var(--accent)]'
              )}
            >
              계정 관리
            </span>
          </nav>
        </div>
      </header>

      <main className={cn('relative z-10 max-w-2xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-[color:var(--ink-muted)]'
            )}
          >
            Session Management
          </p>
          <h1
            className={cn(
              'font-[var(--font-display)] text-3xl sm:text-4xl leading-tight text-[color:var(--ink)]'
            )}
          >
            계정 관리
          </h1>
          <p className={cn('text-base text-[color:var(--ink-muted)] max-w-xl')}>
            Playwright 세션 생성 및 계정 로그인 상태 관리
          </p>
        </div>

        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <AccountListUI />
        </div>

        <div
          className={cn(
            'mt-10 rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-soft)]/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-[color:var(--accent-strong)] mb-2')}>
            사용 방법
          </h3>
          <ol
            className={cn(
              'text-sm text-[color:var(--ink-muted)] space-y-1 list-decimal list-inside'
            )}
          >
            <li>&quot;로그인&quot; 버튼을 눌러 각 계정의 Playwright 세션 생성</li>
            <li>네이버 로그인 페이지에서 직접 로그인 진행</li>
            <li>로그인 완료 후 세션이 유지되어 자동화 작업 가능</li>
            <li>세션 만료 시 다시 로그인 필요</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
