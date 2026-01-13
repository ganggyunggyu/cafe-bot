import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { AccountManagerUI, CafeManagerUI } from '@/features/accounts';

export default function AccountsPage() {
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
                  Account Manager
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
            <span
              className={cn(
                'text-sm font-semibold text-(--ink) border-b-2 border-(--accent)'
              )}
            >
              계정 관리
            </span>
            <Link
              href="/settings"
              className={cn(
                'text-sm text-(--ink-muted) hover:text-(--ink)'
              )}
            >
              설정
            </Link>
          </nav>
        </div>
      </header>

      <main className={cn('relative z-10 max-w-4xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-(--ink-muted)'
            )}
          >
            Account & Cafe Management
          </p>
          <h1
            className={cn(
              'font-(--font-display) text-3xl sm:text-4xl leading-tight text-(--ink)'
            )}
          >
            계정 & 카페 관리
          </h1>
          <p className={cn('text-base text-(--ink-muted) max-w-xl')}>
            네이버 계정과 카페 설정을 관리합니다
          </p>
        </div>

        <div className={cn('grid gap-6 lg:grid-cols-2')}>
          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
            )}
          >
            <AccountManagerUI />
          </div>

          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
            )}
          >
            <CafeManagerUI />
          </div>
        </div>

        <div
          className={cn(
            'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-(--accent-strong) mb-2')}>
            사용 방법
          </h3>
          <ol
            className={cn(
              'text-sm text-(--ink-muted) space-y-1 list-decimal list-inside'
            )}
          >
            <li>처음 사용 시 &quot;설정파일 가져오기&quot; 버튼으로 기존 설정 마이그레이션</li>
            <li>&quot;+ 추가&quot; 버튼으로 새 계정/카페 등록</li>
            <li>&quot;테스트&quot; 버튼으로 로그인 상태 확인</li>
            <li>기본 카페 설정으로 배치 작업 시 사용할 카페 지정</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
