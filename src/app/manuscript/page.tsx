import { cn } from '@/shared/lib/cn';
import { PageLayout } from '@/shared/ui';
import { ManuscriptUploadUI } from '@/features/auto-comment/publish';

export default function ManuscriptPage() {
  return (
    <PageLayout
      title="원고 업로드"
      subtitle="폴더 드래그앤드랍으로 최대 100개 원고를 한 번에 업로드"
    >
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8')}>
        <div className={cn('space-y-6')}>
          <div>
            <h2 className={cn('text-lg font-semibold text-(--ink)')}>원고 일괄 업로드</h2>
            <p className={cn('text-sm text-(--ink-muted) mt-1')}>
              발행 또는 기존 글 수정 모드를 선택하세요
            </p>
          </div>
          <ManuscriptUploadUI />
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
          폴더 구조 안내
        </summary>

        <div className={cn('mt-4 grid gap-4 lg:grid-cols-2')}>
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
            <h3 className={cn('font-semibold text-(--ink) mb-3')}>기본 구조</h3>
            <pre className={cn('text-xs text-(--ink-muted) bg-(--surface) rounded-lg p-3 font-mono')}>
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

          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
            <h3 className={cn('font-semibold text-(--ink) mb-3')}>규칙</h3>
            <ul className={cn('text-sm text-(--ink-muted) space-y-2')}>
              <li>• 폴더명: <code className={cn('bg-(--surface) px-1.5 py-0.5 rounded text-xs')}>원고명_카테고리</code></li>
              <li>• 구분자: <code className={cn('bg-(--surface) px-1.5 py-0.5 rounded text-xs')}>_</code> (언더스코어)</li>
              <li>• 원고 파일: <code className={cn('bg-(--surface) px-1.5 py-0.5 rounded text-xs')}>원고.txt</code></li>
              <li>• 이미지: png, jpg, gif, webp 지원</li>
              <li>• 카테고리 생략 시 기본 게시판 사용</li>
            </ul>
          </div>
        </div>
      </details>
    </PageLayout>
  );
}
