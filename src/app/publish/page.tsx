import { cn } from '@/shared/lib/cn';
import { PostOnlyUI, CommentOnlyUI } from '@/features/auto-comment/publish';
import { PageLayout } from '@/shared/ui';

export default function PublishPage() {
  return (
    <PageLayout
      title="분리 발행 모드"
      subtitle="Natural Engagement"
      description="글만 발행하거나, 기존 글에 댓글만 달거나 - 자연스러운 타임라인 구성"
    >
      <div className={cn('grid gap-8 lg:grid-cols-2')}>
        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <PostOnlyUI />
        </div>
        <div
          className={cn(
            'rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
          )}
        >
          <CommentOnlyUI />
        </div>
      </div>

      <div
        className={cn(
          'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
        )}
      >
        <h3 className={cn('font-semibold text-(--accent-strong) mb-2')}>
          분리 발행 사용법
        </h3>
        <div className={cn('grid md:grid-cols-2 gap-6')}>
          <div>
            <h4 className={cn('text-sm font-medium text-(--ink) mb-1')}>
              글만 발행
            </h4>
            <ul className={cn('text-sm text-(--ink-muted) space-y-1 list-disc list-inside')}>
              <li>키워드 입력 후 발행 버튼 클릭</li>
              <li>댓글 없이 글만 발행됨</li>
              <li>원고 데이터 축적 용도</li>
            </ul>
          </div>
          <div>
            <h4 className={cn('text-sm font-medium text-(--ink) mb-1')}>
              댓글만 달기
            </h4>
            <ul className={cn('text-sm text-(--ink-muted) space-y-1 list-disc list-inside')}>
              <li>3일 이내 글 중 랜덤 절반 선택</li>
              <li>글당 3~5개 (대댓글 70%)</li>
              <li>자동으로 댓글/대댓글 추가</li>
            </ul>
          </div>
        </div>
        <p className={cn('mt-4 text-xs text-(--ink-muted)')}>
          이 방식으로 글 발행과 댓글을 분리하면 타임라인이 더 자연스러워집니다.
        </p>
      </div>
    </PageLayout>
  );
}
