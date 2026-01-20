import { cn } from '@/shared/lib/cn';
import { CafeJoinUI } from './cafe-join-ui';
import { PageLayout } from '@/shared/ui';

export default function CafeJoinPage() {
  return (
    <PageLayout
      title="카페 일괄 가입"
      subtitle="Batch Cafe Join"
      description="모든 계정을 모든 카페에 자동으로 가입시킵니다."
    >
      <div
        className={cn(
          'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg max-w-3xl'
        )}
      >
        <CafeJoinUI />
      </div>

      <div
        className={cn(
          'mt-10 rounded-2xl border border-(--border) bg-(--teal-soft)/70 p-6 max-w-3xl'
        )}
      >
        <h3 className={cn('font-semibold text-(--teal) mb-2')}>
          사용 안내
        </h3>
        <ul
          className={cn(
            'text-sm text-(--ink-muted) space-y-1 list-disc list-inside'
          )}
        >
          <li>accounts.ts에 등록된 모든 계정</li>
          <li>cafes.ts에 등록된 모든 카페</li>
          <li>새 계정/카페 추가 후 한번 실행하면 전체 가입됨</li>
          <li>이미 가입된 계정은 &quot;이미 회원&quot;으로 표시</li>
        </ul>
      </div>
    </PageLayout>
  );
}
