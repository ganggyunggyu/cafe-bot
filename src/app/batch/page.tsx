import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { BatchUI, KeywordGeneratorUI, QueueStatusUI } from '@/features/auto-comment/batch';
import { PageLayout } from '@/shared/ui';

export default function BatchPage() {
  return (
    <PageLayout
      title="배치 자동 포스팅"
      subtitle="Full Automation"
      description="여러 키워드 입력 → 계정 로테이션 글 작성 → 자동 댓글 + 대댓글"
    >
      <section
        className={cn(
          'relative overflow-hidden rounded-[32px] border border-(--border) bg-white/70 p-6 shadow-[0_18px_40px_-28px_rgba(32,24,18,0.6)] backdrop-blur'
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-(--accent-soft)/80 blur-3xl'
          )}
        />
        <div
          className={cn(
            'pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-(--teal-soft)/80 blur-3xl'
          )}
        />
        <div className={cn('relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]')}>
          <div className={cn('space-y-4')}>
            <p
              className={cn(
                'text-xs uppercase tracking-[0.28em] text-(--ink-muted)'
              )}
            >
              Batch Flow
            </p>
            <div className={cn('space-y-2')}>
              <h2 className={cn('text-2xl font-semibold text-(--ink)')}>
                오늘 배치 흐름을 한 장으로
              </h2>
              <p className={cn('text-sm text-(--ink-muted) leading-relaxed')}>
                키워드 수급부터 계정 로테이션, 댓글 체인까지 한 번에 묶습니다. 아래 순서대로
                진행하면 큐가 안정적으로 돌아갑니다.
              </p>
            </div>
            <div className={cn('flex flex-wrap gap-2')}>
              {['키워드 생성', '배치 입력', '댓글 체인', '상태 모니터링'].map((label) => (
                <span
                  key={label}
                  className={cn(
                    'rounded-full border border-(--border) bg-white/70 px-3 py-1 text-xs text-(--ink-muted)'
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div
            className={cn(
              'rounded-2xl border border-(--border) bg-(--surface-muted)/80 p-4'
            )}
          >
            <p className={cn('text-sm font-semibold text-(--ink) mb-3')}>
              빠른 체크
            </p>
            <ul className={cn('space-y-2 text-xs text-(--ink-muted)')}>
              <li>• 계정 로그인 상태 확인</li>
              <li>• 금일 발행 제한 수치 확인</li>
              <li>• 큐 지연 로그 점검</li>
            </ul>
            <div className={cn('mt-4 rounded-xl bg-white/70 px-3 py-2 text-xs')}>
              <p className={cn('text-(--ink-muted)')}>
                준비되면 아래 1단계부터 시작합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={cn('mt-10 grid gap-8 lg:grid-cols-2')}>
        <div
          className={cn(
            'rounded-3xl border border-(--border) bg-white/80 p-6 shadow-[0_16px_40px_-30px_rgba(27,25,21,0.6)] backdrop-blur'
          )}
        >
          <div className={cn('mb-5 flex items-start justify-between')}>
            <div>
              <p
                className={cn(
                  'text-xs uppercase tracking-[0.25em] text-(--ink-muted)'
                )}
              >
                Keyword Studio
              </p>
              <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>
                키워드 생성
              </h3>
            </div>
            <span
              className={cn(
                'rounded-full bg-(--accent-soft) px-3 py-1 text-xs font-semibold text-(--accent-strong)'
              )}
            >
              Step 01
            </span>
          </div>
          <KeywordGeneratorUI />
        </div>

        <div
          className={cn(
            'rounded-3xl border border-(--border) bg-white/80 p-6 shadow-[0_16px_40px_-30px_rgba(27,25,21,0.6)] backdrop-blur'
          )}
        >
          <div className={cn('mb-5 flex items-start justify-between')}>
            <div>
              <p
                className={cn(
                  'text-xs uppercase tracking-[0.25em] text-(--ink-muted)'
                )}
              >
                Batch Console
              </p>
              <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>
                배치 실행
              </h3>
            </div>
            <span
              className={cn(
                'rounded-full bg-(--teal-soft) px-3 py-1 text-xs font-semibold text-(--teal)'
              )}
            >
              Step 02
            </span>
          </div>
          <BatchUI />
        </div>
      </section>

      <section
        className={cn(
          'mt-8 rounded-3xl border border-(--border) bg-white/80 p-6 shadow-[0_16px_40px_-30px_rgba(27,25,21,0.6)] backdrop-blur'
        )}
      >
        <div className={cn('mb-4 flex items-center justify-between')}>
          <div>
            <p className={cn('text-xs uppercase tracking-[0.25em] text-(--ink-muted)')}>
              Queue Radar
            </p>
            <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>
              큐 상태 모니터
            </h3>
          </div>
          <span
            className={cn(
              'rounded-full border border-(--border) bg-white/70 px-3 py-1 text-xs text-(--ink-muted)'
            )}
          >
            Live
          </span>
        </div>
        <QueueStatusUI />
      </section>

      <section className={cn('mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]')}>
        <div
          className={cn(
            'rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-(--accent-strong) mb-3')}>
            배치 모드 사용법
          </h3>
          <ol
            className={cn(
              'text-sm text-(--ink-muted) space-y-2 list-decimal list-inside'
            )}
          >
            <li>좌측 키워드 생성기로 AI가 키워드 생성</li>
            <li>&quot;카테고리 포함 복사&quot; 버튼 클릭</li>
            <li>우측 배치 입력창에 붙여넣기</li>
            <li>&quot;배치 발행&quot; 또는 &quot;배치 수정&quot; 버튼 클릭</li>
          </ol>
          <div className={cn('mt-4 rounded-xl bg-white/70 p-3 text-xs text-(--ink-muted)')}>
            <p className={cn('font-semibold text-(--ink) mb-1')}>바로가기</p>
            <p>
              계정 로그인은{' '}
              <Link
                href="/accounts"
                className={cn('text-(--accent-strong) underline underline-offset-4')}
              >
                계정 관리
              </Link>{' '}
              페이지에서 진행합니다.
            </p>
          </div>
        </div>

        <div
          className={cn(
            'rounded-2xl border border-(--border) bg-white/80 p-6'
          )}
        >
          <h3 className={cn('font-semibold text-(--ink) mb-3')}>
            계정 로테이션 로직
          </h3>
          <ul className={cn('text-sm text-(--ink-muted) space-y-2')}>
            <li>• 키워드1: 계정A 글 작성 → B,C,D 댓글 → 대댓글 체인</li>
            <li>• 키워드2: 계정B 글 작성 → A,C,D 댓글 → 대댓글 체인</li>
            <li>• 키워드3: 계정C 글 작성 → A,B,D 댓글 → 대댓글 체인</li>
            <li>• 반복 진행, 계정 부하 분산</li>
          </ul>
          <div className={cn('mt-4 rounded-xl border border-(--border) bg-(--surface-muted) p-3 text-xs text-(--ink-muted)')}>
            <p>하루 기준으로 로테이션 순서를 유지하면 차단 위험이 줄어듭니다.</p>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
