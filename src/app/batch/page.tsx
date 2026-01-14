import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { BatchUI, KeywordGeneratorUI, QueueStatusUI } from '@/features/auto-comment/batch';
import { PageLayout } from '@/shared/ui';

export default function BatchPage() {
  return (
    <PageLayout
      title="배치 자동 포스팅"
      subtitle="Full Automation"
      description="여러 키워드 입력 → 계정 로테이션 글 작성 → 자동 댓글 + 대댓글"
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
          <BatchUI />
        </div>
      </div>

      <div
        className={cn(
          'mt-8 rounded-3xl border border-white/80 bg-white/70 backdrop-blur-xl p-6 shadow-lg'
        )}
      >
        <QueueStatusUI />
      </div>

      <div
        className={cn(
          'mt-10 rounded-2xl border border-(--border) bg-(--accent-soft)/70 p-6'
        )}
      >
        <h3 className={cn('font-semibold text-(--accent-strong) mb-2')}>
          배치 모드 사용법
        </h3>
        <ol
          className={cn(
            'text-sm text-(--ink-muted) space-y-1 list-decimal list-inside'
          )}
        >
          <li>좌측 키워드 생성기로 AI가 키워드 생성</li>
          <li>&quot;카테고리 포함 복사&quot; 버튼 클릭</li>
          <li>우측 배치 입력창에 붙여넣기</li>
          <li>&quot;배치 발행&quot; 또는 &quot;배치 수정&quot; 버튼 클릭</li>
        </ol>
        <div className={cn('mt-4 p-3 rounded-xl bg-white/50 text-xs text-(--ink-muted)')}>
          <p className={cn('font-semibold mb-1')}>작동 방식:</p>
          <ul className={cn('space-y-0.5')}>
            <li>• 키워드1: 계정A 글 작성 → B,C,D 댓글 → 대댓글 체인</li>
            <li>• 키워드2: 계정B 글 작성 → A,C,D 댓글 → 대댓글 체인</li>
            <li>• 키워드3: 계정C 글 작성 → A,B,D 댓글 → 대댓글 체인</li>
            <li>• ... (계정 로테이션)</li>
          </ul>
          <p className={cn('mt-2 font-semibold')}>
            계정 로그인은 <Link href="/accounts" className="text-(--accent) underline">계정 관리</Link> 페이지에서 진행
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
