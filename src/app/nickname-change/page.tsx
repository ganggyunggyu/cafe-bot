import { cn } from '@/shared/lib/cn';
import { NicknameChangeUI } from './nickname-change-ui';
import { PageLayout } from '@/shared/ui';

export default function NicknameChangePage() {
  return (
    <PageLayout
      title="닉네임 변경"
      subtitle="랜덤 닉네임으로 카페별 닉네임을 일괄 변경합니다"
    >
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8 max-w-3xl')}>
        <div className={cn('space-y-6')}>
          <div>
            <h2 className={cn('text-lg font-semibold text-(--ink)')}>닉네임 일괄 변경</h2>
            <p className={cn('text-sm text-(--ink-muted) mt-1')}>
              닉네임은 랜덤 생성되며 중복되지 않습니다
            </p>
          </div>
          <NicknameChangeUI />
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
            <li>• <span className={cn('font-medium text-(--ink)')}>카페 기준</span>: 선택한 카페에서 모든 계정의 닉네임 변경</li>
            <li>• <span className={cn('font-medium text-(--ink)')}>계정 기준</span>: 선택한 계정으로 모든 카페의 닉네임 변경</li>
            <li>• <span className={cn('font-medium text-(--ink)')}>전체 순회</span>: 모든 계정 × 모든 카페 조합 변경</li>
          </ul>
        </div>
      </details>
    </PageLayout>
  );
}
