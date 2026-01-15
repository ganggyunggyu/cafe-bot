import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { PageLayout } from '@/shared/ui';
import { ViralBatchUI } from '@/features/viral/viral-batch-ui';
import { QueueStatusUI } from '@/features/auto-comment/batch';

export default function ViralPage() {
  return (
    <PageLayout
      title="바이럴 콘텐츠 생성"
      subtitle="Viral Content"
      description="AI가 제목, 본문, 댓글, 대댓글을 한 번에 생성합니다."
    >
      <section
        className={cn(
          'relative overflow-hidden rounded-[32px] border border-(--border) bg-white/70 p-6 shadow-[0_18px_40px_-28px_rgba(32,24,18,0.6)] backdrop-blur'
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-200/60 blur-3xl'
          )}
        />
        <div
          className={cn(
            'pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-pink-200/60 blur-3xl'
          )}
        />
        <div className={cn('relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]')}>
          <div className={cn('space-y-4')}>
            <p className={cn('text-xs uppercase tracking-[0.28em] text-(--ink-muted)')}>
              One-Shot Generation
            </p>
            <div className={cn('space-y-2')}>
              <h2 className={cn('text-2xl font-semibold text-(--ink)')}>
                바이럴 콘텐츠 원샷 생성
              </h2>
              <p className={cn('text-sm text-(--ink-muted) leading-relaxed')}>
                키워드 입력 → AI가 제목/본문/댓글/대댓글 전체 구조 생성 → 자동 발행
              </p>
            </div>
            <div className={cn('flex flex-wrap gap-2')}>
              {['키워드 자동 분류', '제목+본문', '댓글 구조', '대댓글 체인'].map((label) => (
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
          <div className={cn('rounded-2xl border border-(--border) bg-(--surface-muted)/80 p-4')}>
            <p className={cn('text-sm font-semibold text-(--ink) mb-3')}>특징</p>
            <ul className={cn('space-y-2 text-xs text-(--ink-muted)')}>
              <li>• 자사/타사 키워드 자동 분류</li>
              <li>• 댓글 기호 자동 파싱 (☆★○)</li>
              <li>• 글쓴이 대댓글, 제3자 대댓글 지원</li>
            </ul>
            <div className={cn('mt-4 rounded-xl bg-white/70 px-3 py-2 text-xs')}>
              <p className={cn('text-(--ink-muted)')}>
                기존 배치와 달리 AI 호출 1번으로 전체 구조를 생성합니다.
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
              <p className={cn('text-xs uppercase tracking-[0.25em] text-(--ink-muted)')}>
                Viral Studio
              </p>
              <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>
                바이럴 배치 실행
              </h3>
            </div>
            <span
              className={cn(
                'rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700'
              )}
            >
              Main
            </span>
          </div>
          <ViralBatchUI />
        </div>

        <div
          className={cn(
            'rounded-3xl border border-(--border) bg-white/80 p-6 shadow-[0_16px_40px_-30px_rgba(27,25,21,0.6)] backdrop-blur'
          )}
        >
          <div className={cn('mb-4 flex items-center justify-between')}>
            <div>
              <p className={cn('text-xs uppercase tracking-[0.25em] text-(--ink-muted)')}>
                Queue Radar
              </p>
              <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>큐 상태 모니터</h3>
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
        </div>
      </section>

      <section className={cn('mt-10 grid gap-6 lg:grid-cols-2')}>
        <div className={cn('rounded-2xl border border-violet-200 bg-violet-50/70 p-6')}>
          <h3 className={cn('font-semibold text-violet-700 mb-3')}>댓글 기호 규칙</h3>
          <ul className={cn('text-sm text-(--ink-muted) space-y-2')}>
            <li>
              <span className={cn('font-mono bg-white/50 px-1.5 py-0.5 rounded')}>댓글N</span>
              <span className={cn('mx-2')}>→</span>
              게시글에 대한 일반 댓글
            </li>
            <li>
              <span className={cn('font-mono bg-white/50 px-1.5 py-0.5 rounded')}>☆댓글N</span>
              <span className={cn('mx-2')}>→</span>
              원글 작성자의 답댓글
            </li>
            <li>
              <span className={cn('font-mono bg-white/50 px-1.5 py-0.5 rounded')}>★댓글N</span>
              <span className={cn('mx-2')}>→</span>
              댓글 작성자의 답변
            </li>
            <li>
              <span className={cn('font-mono bg-white/50 px-1.5 py-0.5 rounded')}>○댓글N</span>
              <span className={cn('mx-2')}>→</span>
              제3자의 답댓글
            </li>
          </ul>
        </div>

        <div className={cn('rounded-2xl border border-(--border) bg-white/80 p-6')}>
          <h3 className={cn('font-semibold text-(--ink) mb-3')}>기존 배치와 차이점</h3>
          <div className={cn('grid grid-cols-2 gap-4 text-xs')}>
            <div className={cn('space-y-2')}>
              <p className={cn('font-semibold text-(--ink)')}>기존 배치</p>
              <ul className={cn('text-(--ink-muted) space-y-1')}>
                <li>• 글 작성 후 댓글 별도 생성</li>
                <li>• AI 호출 N회 (글+댓글 각각)</li>
                <li>• 랜덤 댓글 내용</li>
              </ul>
            </div>
            <div className={cn('space-y-2')}>
              <p className={cn('font-semibold text-violet-700')}>바이럴 배치</p>
              <ul className={cn('text-(--ink-muted) space-y-1')}>
                <li>• 전체 구조 한 번에 생성</li>
                <li>• AI 호출 1회</li>
                <li>• 맥락에 맞는 댓글 흐름</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className={cn('mt-10')}>
        <Link
          href="/viral/debug"
          className={cn(
            'block rounded-2xl border border-(--border) bg-white/80 p-6 hover:bg-white/90 transition'
          )}
        >
          <div className={cn('flex items-center justify-between')}>
            <div>
              <p className={cn('text-xs uppercase tracking-[0.25em] text-(--ink-muted)')}>
                Debug Console
              </p>
              <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>AI 응답 디버그</h3>
              <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                AI 응답과 파싱 결과를 확인할 수 있습니다
              </p>
            </div>
            <span className={cn('text-2xl text-(--ink-muted)')}>→</span>
          </div>
        </Link>
      </section>
    </PageLayout>
  );
}
