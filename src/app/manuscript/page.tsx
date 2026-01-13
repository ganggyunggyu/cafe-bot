import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { ManuscriptUploadUI } from '@/features/auto-comment/publish';

export default function ManuscriptPage() {
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
                  Manuscript Upload
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
              className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
            >
              배치 모드
            </Link>
            <Link
              href="/publish"
              className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
            >
              분리 발행
            </Link>
            <span
              className={cn(
                'text-sm font-semibold text-(--ink) border-b-2 border-(--accent)'
              )}
            >
              원고 업로드
            </span>
            <Link
              href="/cafe-join"
              className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
            >
              카페 가입
            </Link>
            <Link
              href="/accounts"
              className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
            >
              계정 관리
            </Link>
            <Link
              href="/settings"
              className={cn('text-sm text-(--ink-muted) hover:text-(--ink)')}
            >
              설정
            </Link>
          </nav>
        </div>
      </header>

      <main className={cn('relative z-10 max-w-3xl mx-auto px-6 lg:px-10 py-10 lg:py-16')}>
        <div className={cn('mb-8 space-y-2')}>
          <p
            className={cn('text-xs uppercase tracking-[0.4em] text-(--ink-muted)')}
          >
            Bulk Upload
          </p>
          <h1
            className={cn(
              'font-(--font-display) text-3xl sm:text-4xl leading-tight text-(--ink)'
            )}
          >
            원고 일괄 업로드
          </h1>
          <p className={cn('text-base text-(--ink-muted) max-w-xl')}>
            폴더 드래그앤드랍으로 최대 100개 원고를 한 번에 업로드
          </p>
        </div>

        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <ManuscriptUploadUI />
        </div>

        <div
          className={cn(
            'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-(--accent-strong) mb-3')}>
            폴더 구조 안내
          </h3>
          <div className={cn('grid md:grid-cols-2 gap-6')}>
            <div>
              <h4 className={cn('text-sm font-medium text-(--ink) mb-2')}>
                기본 구조
              </h4>
              <pre className={cn('text-xs text-(--ink-muted) bg-white/50 rounded-lg p-3 font-mono')}>
{`원고폴더/
├─ 제주도여행_일상/
│    ├─ 원고.txt
│    └─ photo1.png
├─ 맛집리뷰_광고/
│    ├─ 원고.txt
│    └─ food.jpg
└─ 자유글/
     └─ 원고.txt`}
              </pre>
            </div>
            <div>
              <h4 className={cn('text-sm font-medium text-(--ink) mb-2')}>
                규칙
              </h4>
              <ul className={cn('text-sm text-(--ink-muted) space-y-2')}>
                <li className={cn('flex gap-2')}>
                  <span className={cn('text-(--accent)')}>•</span>
                  <span>폴더명: <code className={cn('bg-white/50 px-1 rounded')}>원고명_카테고리</code></span>
                </li>
                <li className={cn('flex gap-2')}>
                  <span className={cn('text-(--accent)')}>•</span>
                  <span>구분자: <code className={cn('bg-white/50 px-1 rounded')}>_</code> (언더스코어)</span>
                </li>
                <li className={cn('flex gap-2')}>
                  <span className={cn('text-(--accent)')}>•</span>
                  <span>원고 파일: <code className={cn('bg-white/50 px-1 rounded')}>원고.txt</code> 또는 .txt 파일</span>
                </li>
                <li className={cn('flex gap-2')}>
                  <span className={cn('text-(--accent)')}>•</span>
                  <span>이미지: png, jpg, gif, webp 지원</span>
                </li>
                <li className={cn('flex gap-2')}>
                  <span className={cn('text-(--accent)')}>•</span>
                  <span>카테고리 생략 시 기본 게시판 사용</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
