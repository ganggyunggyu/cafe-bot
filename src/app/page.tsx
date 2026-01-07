import { auth, signIn, signOut } from '@/shared/lib/auth';
import { PostForm } from '@/features/post-article';
import { cn } from '@/shared/lib/cn';
import Link from 'next/link';

export default async function Home() {
  const session = await auth();

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
            'max-w-4xl mx-auto px-6 lg:px-10 py-6 flex flex-wrap items-center justify-between gap-4'
          )}
        >
          <div className={cn('flex items-center gap-3')}>
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
                Naver Cafe
              </p>
              <p className={cn('font-[var(--font-display)] text-lg leading-none')}>
                Cafe Bot
              </p>
            </div>
          </div>

          <nav className={cn('flex items-center gap-4')}>
            <span
              className={cn(
                'text-sm font-semibold text-[color:var(--ink)] border-b-2 border-[var(--accent)]'
              )}
            >
              기본 발행
            </span>
            <Link
              href="/auto"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              자동 댓글
            </Link>
            <Link
              href="/batch"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              배치 작업
            </Link>
          </nav>

          <div className={cn('flex items-center gap-3')}>
            {session ? (
              <div className={cn('flex items-center gap-3 flex-wrap justify-end')}>
                <span className={cn('text-sm text-[color:var(--ink-muted)]')}>
                  {session.user?.name || session.user?.email}
                </span>
                <form
                  action={async () => {
                    'use server';
                    await signOut();
                  }}
                >
                  <button
                    type="submit"
                    className={cn(
                      'rounded-full border border-[color:var(--border)] bg-white/70 px-4 py-2 text-sm font-semibold text-[color:var(--ink)] shadow-sm transition hover:bg-white'
                    )}
                  >
                    로그아웃
                  </button>
                </form>
              </div>
            ) : (
              <form
                action={async () => {
                  'use server';
                  await signIn('naver');
                }}
              >
                <button
                  type="submit"
                  className={cn(
                    'rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(216,92,47,0.35)] transition hover:brightness-105'
                  )}
                >
                  네이버 로그인
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      <main className={cn('relative z-10 max-w-4xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <section
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 md:p-8 shadow-[0_25px_70px_rgba(20,17,10,0.15)]'
          )}
        >
          {session ? (
            <div className={cn('space-y-6')}>
              <div className={cn('space-y-2')}>
                <p
                  className={cn(
                    'text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]'
                  )}
                >
                  Publishing Desk
                </p>
                <h2
                  className={cn(
                    'font-[var(--font-display)] text-2xl text-[color:var(--ink)]'
                  )}
                >
                  카페 글 발행
                </h2>
                <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
                  필수 항목만 채우면 바로 발행된다.
                </p>
              </div>
              <PostForm />
            </div>
          ) : (
            <div className={cn('space-y-6 text-center')}>
              <div className={cn('space-y-3')}>
                <p
                  className={cn(
                    'text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]'
                  )}
                >
                  Welcome
                </p>
                <h2
                  className={cn(
                    'font-[var(--font-display)] text-2xl text-[color:var(--ink)]'
                  )}
                >
                  네이버로 로그인해서 시작해줘.
                </h2>
                <p className={cn('text-sm text-[color:var(--ink-muted)]')}>
                  로그인 후 원고 생성 API를 통해 자동 발행을 진행할 수 있어.
                </p>
              </div>
              <form
                action={async () => {
                  'use server';
                  await signIn('naver');
                }}
              >
                <button
                  type="submit"
                  className={cn(
                    'w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
                    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'
                  )}
                >
                  네이버 로그인으로 시작하기
                </button>
              </form>
              <p className={cn('text-xs text-[color:var(--ink-muted)]')}>
                OAuth 인증만 완료하면 바로 사용할 수 있어.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
