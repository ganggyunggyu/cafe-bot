import { auth, signIn, signOut } from '@/shared/lib/auth';
import { AccountManagerUI, AutoPostUI } from '@/features/auto-comment';
import { cn } from '@/shared/lib/cn';
import Link from 'next/link';

export default async function AutoPage() {
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
                  Auto Comment
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
            <span
              className={cn(
                'text-sm font-semibold text-[color:var(--ink)] border-b-2 border-[var(--accent)]'
              )}
            >
              자동 댓글
            </span>
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

      <main className={cn('relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-[color:var(--ink-muted)]'
            )}
          >
            Multi-Account Automation
          </p>
          <h1
            className={cn(
              'font-[var(--font-display)] text-3xl sm:text-4xl leading-tight text-[color:var(--ink)]'
            )}
          >
            글쓰기 + 자동 댓글
          </h1>
          <p className={cn('text-base text-[color:var(--ink-muted)] max-w-xl')}>
            메인 계정으로 글 작성하고, 나머지 계정들로 댓글을 자동으로 달아.
          </p>
        </div>

        {!session ? (
          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-8 shadow-lg text-center max-w-md mx-auto'
            )}
          >
            <h2 className={cn('text-xl font-semibold mb-4')}>로그인이 필요해</h2>
            <p className={cn('text-sm text-[color:var(--ink-muted)] mb-6')}>
              글 작성을 위해 먼저 네이버 OAuth 로그인을 해줘.
            </p>
            <form
              action={async () => {
                'use server';
                await signIn('naver');
              }}
            >
              <button
                type="submit"
                className={cn(
                  'w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition',
                  'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105'
                )}
              >
                네이버 로그인
              </button>
            </form>
          </div>
        ) : (
          <div className={cn('grid gap-8 lg:grid-cols-2')}>
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
              <AutoPostUI />
            </div>
          </div>
        )}

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
            <li>좌측 &quot;계정 관리&quot;에서 댓글용 네이버 계정들을 추가해</li>
            <li>각 계정마다 &quot;로그인&quot; 버튼 눌러서 세션 생성해 (Playwright 사용)</li>
            <li>우측 &quot;자동 포스팅&quot;에서 글 정보와 댓글 내용 입력해</li>
            <li>&quot;글 작성 + 댓글 달기&quot; 버튼 누르면 자동 실행돼</li>
          </ol>
          <p className={cn('mt-3 text-xs text-[color:var(--ink-muted)]')}>
            * 글 작성은 OAuth 세션 (상단 로그인) 사용, 댓글은 Playwright로 각 계정 세션 사용
          </p>
        </div>
      </main>
    </div>
  );
}
