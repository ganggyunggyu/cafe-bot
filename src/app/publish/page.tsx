import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { PostOnlyUI, CommentOnlyUI } from '@/features/auto-comment/publish';

export default function PublishPage() {
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
                  Separate Mode
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
            <span
              className={cn(
                'text-sm font-semibold text-(--ink) border-b-2 border-(--accent)'
              )}
            >
              분리 발행
            </span>
            <Link
              href="/manuscript"
              className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
            >
              원고 업로드
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

      <main className={cn('relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn(
              'text-xs uppercase tracking-[0.4em] text-(--ink-muted)'
            )}
          >
            Natural Engagement
          </p>
          <h1
            className={cn(
              'font-(--font-display) text-3xl sm:text-4xl leading-tight text-(--ink)'
            )}
          >
            분리 발행 모드
          </h1>
          <p className={cn('text-base text-(--ink-muted) max-w-xl')}>
            글만 발행하거나, 기존 글에 댓글만 달거나 - 자연스러운 타임라인 구성
          </p>
        </div>

        <div className={cn('grid gap-8 lg:grid-cols-2')}>
          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
            )}
          >
            <PostOnlyUI />
          </div>
          <div
            className={cn(
              'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
            )}
          >
            <CommentOnlyUI />
          </div>
        </div>

        <div
          className={cn(
            'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-(--accent-strong) mb-2')}>
            분리 발행 사용법
          </h3>
          <div className={cn('grid md:grid-cols-2 gap-6')}>
            <div>
              <h4 className={cn('text-sm font-medium text-(--ink) mb-1')}>
                글만 발행
              </h4>
              <ul className={cn('text-sm text-(--ink-muted) space-y-1 list-disc list-inside')}>
                <li>키워드 입력 후 발행 버튼 클릭</li>
                <li>댓글 없이 글만 발행됨</li>
                <li>원고 데이터 축적 용도</li>
              </ul>
            </div>
            <div>
              <h4 className={cn('text-sm font-medium text-(--ink) mb-1')}>
                댓글만 달기
              </h4>
              <ul className={cn('text-sm text-(--ink-muted) space-y-1 list-disc list-inside')}>
                <li>3일 이내 글 중 랜덤 절반 선택</li>
                <li>글당 3~5개 (대댓글 70%)</li>
                <li>자동으로 댓글/대댓글 추가</li>
              </ul>
            </div>
          </div>
          <p className={cn('mt-4 text-xs text-(--ink-muted)')}>
            이 방식으로 글 발행과 댓글을 분리하면 타임라인이 더 자연스러워집니다.
          </p>
        </div>
      </main>
    </div>
  );
}
