import { cn } from '@/shared/lib/cn';
import { CafeJoinUI } from './cafe-join-ui';
import { PageLayout } from '@/shared/ui';

export default function CafeJoinPage() {
  return (
    <PageLayout
      title="카페 일괄 가입"
      subtitle="모든 계정을 모든 카페에 자동으로 가입시킵니다"
    >
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8 max-w-3xl')}>
        <div className={cn('space-y-6')}>
          <div>
            <h2 className={cn('text-lg font-semibold text-(--ink)')}>일괄 가입 실행</h2>
            <p className={cn('text-sm text-(--ink-muted) mt-1')}>
              새 계정/카페 추가 후 한번 실행하면 전체 가입됨
            </p>
          </div>
          <CafeJoinUI />
        </div>
      </div>

      <details className={cn('mt-8 group max-w-3xl')}>
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

        <div className={cn('mt-4 rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
          <ul className={cn('text-sm text-(--ink-muted) space-y-2')}>
            <li>• accounts에 등록된 모든 계정</li>
            <li>• cafes에 등록된 모든 카페</li>
            <li>• 이미 가입된 계정은 &quot;이미 회원&quot;으로 표시</li>
          </ul>
        </div>
      </details>
    </PageLayout>
  );
}
