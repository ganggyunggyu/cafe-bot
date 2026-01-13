import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { CafeJoinUI } from './cafe-join-ui';

export default function CafeJoinPage() {
  return (
    <div className={cn('min-h-screen relative overflow-hidden bg-(--surface)')}>
      <div
        className={cn(
          'pointer-events-none absolute -top-24 right-[-10%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,var(--teal-soft),transparent_65%)] blur-3xl opacity-80'
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute bottom-[-25%] left-[-10%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_70%)] blur-3xl opacity-70'
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
                  'h-11 w-11 rounded-2xl bg-(--teal) text-white flex items-center justify-center font-semibold'
                )}
              >
                CJ
              </div>
              <div className={cn('space-y-1')}>
                <p
                  className={cn(
                    'text-[10px] uppercase tracking-[0.35em] text-(--ink-muted)'
                  )}
                >
                  Cafe Join
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
            <span
              className={cn(
                'text-sm font-semibold text-(--ink) border-b-2 border-(--teal)'
              )}
            >
              카페 가입
            </span>
            <Link
              href="/accounts"
              className={cn(
                'text-sm text-(--ink-muted) hover:text-(--ink)'
              )}
            >
              계정 관리
            </Link>
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

      <main className={cn('relative z-10 max-w-3xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-(--ink-muted)'
            )}
          >
            Batch Cafe Join
          </p>
          <h1
            className={cn(
              'font-(--font-display) text-3xl sm:text-4xl leading-tight text-(--ink)'
            )}
          >
            카페 일괄 가입
          </h1>
          <p className={cn('text-base text-(--ink-muted) max-w-xl')}>
            모든 계정을 모든 카페에 자동으로 가입시킵니다.
          </p>
        </div>

        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <CafeJoinUI />
        </div>

        <div
          className={cn(
            'mt-10 rounded-2xl border border-(--border) bg-(--teal-soft)/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-(--teal) mb-2')}>
            사용 안내
          </h3>
          <ul
            className={cn(
              'text-sm text-(--ink-muted) space-y-1 list-disc list-inside'
            )}
          >
            <li>accounts.ts에 등록된 모든 계정</li>
            <li>cafes.ts에 등록된 모든 카페</li>
            <li>새 계정/카페 추가 후 한번 실행하면 전체 가입됨</li>
            <li>이미 가입된 계정은 &quot;이미 회원&quot;으로 표시</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
