import { cn } from '@/shared/lib/cn';
import { NicknameChangeUI } from './nickname-change-ui';
import { PageLayout } from '@/shared/ui';

export default function NicknameChangePage() {
  return (
    <PageLayout
      title="카페 닉네임 변경"
      subtitle="Batch Nickname Change"
      description="랜덤 닉네임으로 카페별 닉네임을 일괄 변경합니다."
    >
      <div
        className={cn(
          'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg max-w-3xl'
        )}
      >
        <NicknameChangeUI />
      </div>

      <div
        className={cn(
          'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6 max-w-3xl'
        )}
      >
        <h3 className={cn('font-semibold text-(--accent) mb-2')}>사용 안내</h3>
        <ul
          className={cn(
            'text-sm text-(--ink-muted) space-y-1 list-disc list-inside'
          )}
        >
          <li>
            <strong>카페 기준</strong>: 선택한 카페에서 모든 계정의 닉네임 변경
          </li>
          <li>
            <strong>계정 기준</strong>: 선택한 계정으로 모든 카페의 닉네임 변경
          </li>
          <li>
            <strong>전체 순회</strong>: 모든 계정 × 모든 카페 조합 변경
          </li>
          <li>닉네임은 랜덤 생성되며 중복되지 않습니다</li>
        </ul>
      </div>
    </PageLayout>
  );
}
