'use client';

import { cn } from '@/shared/lib/cn';
import { AccountManagerUI, CafeManagerUI } from '@/features/accounts';
import { PageLayout, AnimatedTabs, AnimatedCard, SlideUp } from '@/shared/ui';

const TABS = [
  { id: 'accounts', label: '계정 관리' },
  { id: 'cafes', label: '카페 관리' },
];

export default function AccountsPage() {
  return (
    <PageLayout
      title="계정 & 카페"
      subtitle="네이버 계정과 카페 설정을 관리합니다"
    >
      <AnimatedTabs tabs={TABS} defaultTab="accounts">
        {(activeTab) => (
          <AnimatedCard className={cn('p-6 lg:p-8')}>
            {activeTab === 'accounts' && (
              <div className={cn('space-y-6')}>
                <SlideUp>
                  <h2 className={cn('text-lg font-semibold text-(--ink)')}>네이버 계정</h2>
                  <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                    자동화에 사용할 네이버 계정을 관리합니다
                  </p>
                </SlideUp>
                <AccountManagerUI />
              </div>
            )}

            {activeTab === 'cafes' && (
              <div className={cn('space-y-6')}>
                <SlideUp>
                  <h2 className={cn('text-lg font-semibold text-(--ink)')}>카페 설정</h2>
                  <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                    발행할 카페와 카테고리를 설정합니다
                  </p>
                </SlideUp>
                <CafeManagerUI />
              </div>
            )}
          </AnimatedCard>
        )}
      </AnimatedTabs>

      <details className={cn('mt-8 group')}>
        <summary
          className={cn(
            'flex items-center gap-2 cursor-pointer text-sm text-(--ink-muted) hover:text-(--ink) transition',
            'list-none [&::-webkit-details-marker]:hidden'
          )}
        >
          <svg
            className={cn('w-4 h-4 transition-transform group-open:rotate-90')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          사용 방법
        </summary>

        <div className={cn('mt-4 rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
          <ol className={cn('text-sm text-(--ink-muted) space-y-2 list-decimal list-inside')}>
            <li>처음 사용 시 &quot;설정파일 가져오기&quot; 버튼으로 기존 설정 마이그레이션</li>
            <li>&quot;+ 추가&quot; 버튼으로 새 계정/카페 등록</li>
            <li>&quot;테스트&quot; 버튼으로 로그인 상태 확인</li>
            <li>기본 카페 설정으로 배치 작업 시 사용할 카페 지정</li>
          </ol>
        </div>
      </details>
    </PageLayout>
  );
}
