import { cn } from '@/shared/lib/cn';
import { AccountManagerUI, CafeManagerUI } from '@/features/accounts';
import { PageLayout } from '@/shared/ui';

export default function AccountsPage() {
  return (
    <PageLayout
      title="계정 & 카페 관리"
      subtitle="Account & Cafe Management"
      description="네이버 계정과 카페 설정을 관리합니다"
    >
      <div className={cn('grid gap-6 lg:grid-cols-2')}>
        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <AccountManagerUI />
        </div>

        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <CafeManagerUI />
        </div>
      </div>

      <div
        className={cn(
          'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
        )}
      >
        <h3 className={cn('font-semibold text-(--accent-strong) mb-2')}>
          사용 방법
        </h3>
        <ol
          className={cn(
            'text-sm text-(--ink-muted) space-y-1 list-decimal list-inside'
          )}
        >
          <li>처음 사용 시 &quot;설정파일 가져오기&quot; 버튼으로 기존 설정 마이그레이션</li>
          <li>&quot;+ 추가&quot; 버튼으로 새 계정/카페 등록</li>
          <li>&quot;테스트&quot; 버튼으로 로그인 상태 확인</li>
          <li>기본 카페 설정으로 배치 작업 시 사용할 카페 지정</li>
        </ol>
      </div>
    </PageLayout>
  );
}
