import { cn } from '@/shared/lib/cn';
import { PageLayout } from '@/shared/ui';
import { ViralDebugUI } from '@/features/viral/viral-debug-ui';

export default function ViralDebugPage() {
  return (
    <PageLayout
      title="AI 응답 디버그"
      subtitle="바이럴 콘텐츠 생성 시 AI 응답을 확인합니다"
    >
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8')}>
        <div className={cn('space-y-6')}>
          <div>
            <h2 className={cn('text-lg font-semibold text-(--ink)')}>디버그 콘솔</h2>
            <p className={cn('text-sm text-(--ink-muted) mt-1')}>
              AI 응답과 파싱 결과를 확인합니다
            </p>
          </div>
          <ViralDebugUI />
        </div>
      </div>
    </PageLayout>
  );
}
