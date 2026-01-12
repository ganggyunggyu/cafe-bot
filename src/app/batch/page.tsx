import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { BatchUI, KeywordGeneratorUI } from '@/features/auto-comment/batch';

export default function BatchPage() {
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
                  Batch Mode
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
              배치 모드
            </span>
            <Link
              href="/publish"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              분리 발행
            </Link>
            <Link
              href="/cafe-join"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              카페 가입
            </Link>
            <Link
              href="/accounts"
              className={cn(
                'text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
              )}
            >
              계정 관리
            </Link>
          </nav>
        </div>
      </header>

      <main className={cn('relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-[color:var(--ink-muted)]'
            )}
          >
            Full Automation
          </p>
          <h1
            className={cn(
              'font-[var(--font-display)] text-3xl sm:text-4xl leading-tight text-[color:var(--ink)]'
            )}
          >
            배치 자동 포스팅
          </h1>
          <p className={cn('text-base text-[color:var(--ink-muted)] max-w-xl')}>
            여러 키워드 입력 → 계정 로테이션 글 작성 → 자동 댓글 + 대댓글
          </p>
        </div>

        <div className={cn('grid gap-8 lg:grid-cols-2')}>
          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
            )}
          >
            <KeywordGeneratorUI />
          </div>
          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
            )}
          >
            <BatchUI />
          </div>
        </div>

        <div
          className={cn(
            'mt-10 rounded-2xl border border-[color:var(--border)] bg-[color:var(--accent-soft)]/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-[color:var(--accent-strong)] mb-2')}>
            배치 모드 사용법
          </h3>
          <ol
            className={cn(
              'text-sm text-[color:var(--ink-muted)] space-y-1 list-decimal list-inside'
            )}
          >
            <li>좌측 키워드 생성기로 AI가 키워드 생성</li>
            <li>&quot;카테고리 포함 복사&quot; 버튼 클릭</li>
            <li>우측 배치 입력창에 붙여넣기</li>
            <li>&quot;배치 발행&quot; 또는 &quot;배치 수정&quot; 버튼 클릭</li>
          </ol>
          <div className={cn('mt-4 p-3 rounded-xl bg-white/50 text-xs text-[color:var(--ink-muted)]')}>
            <p className={cn('font-semibold mb-1')}>작동 방식:</p>
            <ul className={cn('space-y-0.5')}>
              <li>• 키워드1: 계정A 글 작성 → B,C,D 댓글 → 대댓글 체인</li>
              <li>• 키워드2: 계정B 글 작성 → A,C,D 댓글 → 대댓글 체인</li>
              <li>• 키워드3: 계정C 글 작성 → A,B,D 댓글 → 대댓글 체인</li>
              <li>• ... (계정 로테이션)</li>
            </ul>
            <p className={cn('mt-2 font-semibold')}>
              계정 로그인은 <Link href="/accounts" className="text-[color:var(--accent)] underline">계정 관리</Link> 페이지에서 진행
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
