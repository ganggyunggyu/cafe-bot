import { cn } from '@/shared/lib/cn';
import { PageLayout } from '@/shared/ui';
import { ManualPostUI } from '@/features/manual-post';

export default function ManualPostPage() {
  return (
    <PageLayout
      title="수동 원고 발행/수정"
      subtitle="Manual Post"
      description="폴더를 드래그앤드랍하여 원고를 발행하거나 기존 글을 수정합니다."
    >
      <section
        className={cn(
          'relative overflow-hidden rounded-[32px] border border-(--border) bg-white/70 p-6 shadow-[0_18px_40px_-28px_rgba(32,24,18,0.6)] backdrop-blur'
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-200/60 blur-3xl'
          )}
        />
        <div
          className={cn(
            'pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-teal-200/60 blur-3xl'
          )}
        />
        <div className={cn('relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]')}>
          <div className={cn('space-y-4')}>
            <p className={cn('text-xs uppercase tracking-[0.28em] text-(--ink-muted)')}>
              Drag & Drop
            </p>
            <div className={cn('space-y-2')}>
              <h2 className={cn('text-2xl font-semibold text-(--ink)')}>
                수동 원고 관리
              </h2>
              <p className={cn('text-sm text-(--ink-muted) leading-relaxed')}>
                폴더 업로드 → 원고 파싱 → 발행 또는 기존 글 수정
              </p>
            </div>
            <div className={cn('flex flex-wrap gap-2')}>
              {['드래그앤드랍', '폴더 구조', '이미지 첨부', '카테고리 지정'].map((label) => (
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
              <li>• AI 생성 없이 원고 그대로 발행</li>
              <li>• 이미지 파일 자동 첨부</li>
              <li>• 발행: 큐 기반 비동기 처리</li>
              <li>• 수정: 동기적 순차 처리</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={cn('mt-10')}>
        <div
          className={cn(
            'rounded-3xl border border-(--border) bg-white/80 p-6 shadow-[0_16px_40px_-30px_rgba(27,25,21,0.6)] backdrop-blur'
          )}
        >
          <div className={cn('mb-5 flex items-start justify-between')}>
            <div>
              <p className={cn('text-xs uppercase tracking-[0.25em] text-(--ink-muted)')}>
                Manual Studio
              </p>
              <h3 className={cn('text-lg font-semibold text-(--ink) mt-1')}>
                원고 발행/수정
              </h3>
            </div>
            <span
              className={cn(
                'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700'
              )}
            >
              Main
            </span>
          </div>
          <ManualPostUI />
        </div>
      </section>

      <section className={cn('mt-10 grid gap-6 lg:grid-cols-2')}>
        <div className={cn('rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6')}>
          <h3 className={cn('font-semibold text-emerald-700 mb-3')}>폴더 구조</h3>
          <pre className={cn('text-xs text-(--ink-muted) font-mono bg-white/50 p-3 rounded-xl')}>
{`상위폴더/
├── 원고1/
│   ├── 원고.txt
│   ├── image1.jpg
│   └── image2.png
├── 원고2:카테고리/
│   └── 원고.txt
└── ...`}
          </pre>
        </div>

        <div className={cn('rounded-2xl border border-(--border) bg-white/80 p-6')}>
          <h3 className={cn('font-semibold text-(--ink) mb-3')}>원고.txt 형식</h3>
          <div className={cn('text-xs text-(--ink-muted) space-y-2')}>
            <p>첫 번째 줄: <span className={cn('font-semibold text-(--ink)')}>제목</span></p>
            <p>이후: <span className={cn('font-semibold text-(--ink)')}>본문</span></p>
            <div className={cn('bg-white/50 p-3 rounded-xl font-mono mt-3')}>
              <p className={cn('text-(--ink)')}>여기가 제목입니다</p>
              <p className={cn('text-(--ink-muted)')}>여기부터는</p>
              <p className={cn('text-(--ink-muted)')}>본문 내용입니다.</p>
            </div>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
