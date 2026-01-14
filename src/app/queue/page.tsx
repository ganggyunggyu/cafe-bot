import { cn } from '@/shared/lib/cn';
import { QueueDashboardUI } from '@/features/auto-comment/batch/queue-dashboard-ui';
import { PageLayout } from '@/shared/ui';

export default function QueuePage() {
  return (
    <PageLayout
      title="큐 대시보드"
      subtitle="Queue Monitor"
      description="예약된 작업 상세 모니터링 및 관리"
    >
      <div
        className={cn(
          'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
        )}
      >
        <QueueDashboardUI />
      </div>
    </PageLayout>
  );
}
