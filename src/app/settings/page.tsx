import { cn } from '@/shared/lib/cn';
import { DelaySettingsUI } from '@/features/settings/delay-ui';
import { PageLayout } from '@/shared/ui';

export default function SettingsPage() {
  return (
    <PageLayout
      title="설정"
      subtitle="작업 딜레이 및 재시도 설정"
    >
      <div
        className={cn(
          'rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8'
        )}
      >
        <h2 className={cn('text-lg font-semibold text-(--ink) mb-6')}>큐 설정</h2>
        <DelaySettingsUI />
      </div>
    </PageLayout>
  );
}
