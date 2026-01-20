import { signIn } from '@/shared/lib/auth';
import { cn } from '@/shared/lib/cn';

export default function LoginPage() {
  return (
    <div className={cn('min-h-screen relative overflow-hidden')}>
      <div
        className={cn(
          'pointer-events-none absolute -top-24 right-[-10%] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,var(--accent-soft),transparent_65%)] blur-3xl opacity-80'
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute bottom-[-25%] left-[-15%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,var(--teal-soft),transparent_70%)] blur-3xl opacity-70'
        )}
      />

      <main
        className={cn(
          'relative z-10 max-w-5xl mx-auto px-6 py-12 min-h-screen flex flex-col lg:flex-row items-center gap-10'
        )}
      >
        <section className={cn('flex-1 space-y-6')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-(--ink-muted)'
            )}
          >
            Naver Cafe Publishing
          </p>
          <h1
            className={cn(
              'font-(--font-display) text-4xl sm:text-5xl leading-tight text-(--ink)'
            )}
          >
            로그인만 하면 바로 자동 발행 준비 완료.
          </h1>
          <p className={cn('text-base sm:text-lg text-(--ink-muted) max-w-lg')}>
            네이버 계정 인증을 마치면 원고 생성과 게시까지 한 번에 이어져. 발행
            작업 흐름을 단단하게 고정해두자.
          </p>
          <div className={cn('grid gap-3 sm:grid-cols-2')}>
            <div
              className={cn(
                'rounded-2xl border border-(--border) bg-white/60 p-4 shadow-sm'
              )}
            >
              <p className={cn('text-sm font-semibold text-(--ink)')}>
                안전한 OAuth 인증
              </p>
              <p className={cn('mt-1 text-xs text-(--ink-muted)')}>
                토큰 기반으로 세션 관리.
              </p>
            </div>
            <div
              className={cn(
                'rounded-2xl border border-(--border) bg-white/60 p-4 shadow-sm'
              )}
            >
              <p className={cn('text-sm font-semibold text-(--ink)')}>
                발행 대기 없음
              </p>
              <p className={cn('mt-1 text-xs text-(--ink-muted)')}>
                로그인 후 즉시 발행 시작.
              </p>
            </div>
          </div>
        </section>

        <section
          className={cn(
            'w-full max-w-md rounded-3xl border border-white/80 bg-white/75 p-8 shadow-[0_25px_70px_rgba(20,17,10,0.15)] backdrop-blur-xl'
          )}
        >
          <div className={cn('space-y-4 text-center')}>
            <div className={cn('space-y-2')}>
              <p
                className={cn(
                  'text-xs uppercase tracking-[0.3em] text-(--ink-muted)'
                )}
              >
                Sign In
              </p>
              <h2
                className={cn(
                  'font-(--font-display) text-2xl text-(--ink)'
                )}
              >
                네이버 로그인
              </h2>
              <p className={cn('text-sm text-(--ink-muted)')}>
                네이버 계정으로 로그인해서 자동 글쓰기 기능을 바로 써봐.
              </p>
            </div>
            <form
              action={async () => {
                'use server';
                await signIn('naver', { redirectTo: '/' });
              }}
            >
              <button
                type="submit"
                className={cn(
                  'w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
                  'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)'
                )}
              >
                네이버로 로그인
              </button>
            </form>
            <p className={cn('text-xs text-(--ink-muted)')}>
              인증 완료 후 홈으로 이동한다.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
