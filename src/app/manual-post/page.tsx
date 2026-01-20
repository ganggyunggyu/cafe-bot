import { cn } from '@/shared/lib/cn';
import { PageLayout } from '@/shared/ui';
import { ManualPostUI } from '@/features/manual-post';

export default function ManualPostPage() {
  return (
    <PageLayout
      title="수동 원고"
      subtitle="폴더 드래그앤드랍으로 원고 발행 또는 기존 글 수정"
    >
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8')}>
        <div className={cn('space-y-6')}>
          <div>
            <h2 className={cn('text-lg font-semibold text-(--ink)')}>원고 발행/수정</h2>
            <p className={cn('text-sm text-(--ink-muted) mt-1')}>
              AI 생성 없이 원고 그대로 발행하거나 기존 글 수정
            </p>
          </div>
          <ManualPostUI />
        </div>
      </div>

      <details className={cn('mt-8 group')}>
        <summary
          className={cn(
            'flex items-center gap-2 cursor-pointer text-sm text-(--ink-muted) hover:text-(--ink) transition',
            'list-none [&::-webkit-details-marker]:hidden'
          )}
        >
          <svg
            className={cn('w-4 h-4 transition-transform group-open:rotate-90')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          사용 안내
        </summary>

        <div className={cn('mt-4 grid gap-4 lg:grid-cols-2')}>
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
            <h3 className={cn('font-semibold text-(--ink) mb-3')}>폴더 구조</h3>
            <pre className={cn('text-xs text-(--ink-muted) bg-(--surface) rounded-lg p-3 font-mono')}>
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

          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
            <h3 className={cn('font-semibold text-(--ink) mb-3')}>원고.txt 형식</h3>
            <div className={cn('text-sm text-(--ink-muted) space-y-2')}>
              <p>• 첫 번째 줄: <span className={cn('font-medium text-(--ink)')}>제목</span></p>
              <p>• 이후: <span className={cn('font-medium text-(--ink)')}>본문</span></p>
            </div>
            <div className={cn('bg-(--surface) p-3 rounded-lg font-mono text-xs mt-3')}>
              <p className={cn('text-(--ink)')}>여기가 제목입니다</p>
              <p className={cn('text-(--ink-muted)')}>여기부터는 본문 내용입니다.</p>
            </div>
          </div>
        </div>

        <div className={cn('mt-4 rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
          <h3 className={cn('font-semibold text-(--ink) mb-3')}>특징</h3>
          <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3')}>
            {['드래그앤드랍', '이미지 자동 첨부', '큐 기반 발행', '순차 수정'].map((label) => (
              <span
                key={label}
                className={cn(
                  'rounded-lg border border-(--border-light) bg-(--surface) px-3 py-2 text-xs text-(--ink-muted) text-center'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </details>
    </PageLayout>
  );
}
