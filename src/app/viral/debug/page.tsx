import { cn } from '@/shared/lib/cn';
import { PageLayout } from '@/shared/ui';
import { ViralDebugUI } from '@/features/viral/viral-debug-ui';

export default function ViralDebugPage() {
  return (
    <PageLayout
      title="AI 응답 디버그"
      subtitle="Debug Console"
      description="바이럴 콘텐츠 생성 시 AI 응답을 확인합니다."
    >
      <div
        className={cn(
          'rounded-3xl border border-(--border) bg-white/80 p-6 shadow-lg backdrop-blur'
        )}
      >
        <ViralDebugUI />
      </div>
    </PageLayout>
  );
}
