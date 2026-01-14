import { cn } from '@/shared/lib/cn';
import { DelaySettingsUI } from '@/features/settings/delay-ui';
import { PageLayout } from '@/shared/ui';

export default function SettingsPage() {
  return (
    <PageLayout
      title="큐 설정"
      subtitle="Queue Settings"
      description="작업 딜레이 및 재시도 설정"
    >
      <div
        className={cn(
          'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg max-w-2xl'
        )}
      >
        <DelaySettingsUI />
      </div>
    </PageLayout>
  );
}
