import { cn } from '@/shared/lib/cn';
import { ApiTestUI, KeywordGeneratorUI } from '@/features/auto-comment/batch';
import { PageLayout } from '@/shared/ui';

export default function TestPage() {
  return (
    <PageLayout
      title="API 테스트"
      subtitle="Content Generation"
      description="원고/댓글/대댓글 생성 API 테스트"
    >
      <div className={cn('grid gap-8 lg:grid-cols-2')}>
        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <KeywordGeneratorUI />
        </div>
        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <ApiTestUI />
        </div>
      </div>
    </PageLayout>
  );
}
