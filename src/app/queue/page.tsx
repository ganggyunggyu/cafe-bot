import { cn } from '@/shared/lib/cn';
import { QueueDashboardUI } from '@/features/auto-comment/batch/queue-dashboard-ui';
import { PageLayout } from '@/shared/ui';

export default function QueuePage() {
  return (
    <PageLayout
      title="큐 대시보드"
      subtitle="예약된 작업 상세 모니터링 및 관리"
    >
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8')}>
        <QueueDashboardUI />
      </div>
    </PageLayout>
  );
}
