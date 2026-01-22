'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { PageLayout, AnimatedTabs, AnimatedCard, SlideUp } from '@/shared/ui';
import { NicknameChangeUI } from './nickname-change-ui';

const TABS = [
  { id: 'by-cafe', label: '카페 기준' },
  { id: 'by-account', label: '계정 기준' },
  { id: 'all', label: '전체 순회' },
];

export default function NicknameChangePage() {
  return (
    <PageLayout
      title="닉네임 변경"
      subtitle="랜덤 닉네임으로 카페별 닉네임을 일괄 변경합니다"
    >
      <AnimatedTabs tabs={TABS} defaultTab="all">
        {(activeTab) => (
          <AnimatedCard className={cn('p-6 lg:p-8')}>
            <div className={cn('space-y-6')}>
              <SlideUp>
                <h2 className={cn('text-lg font-semibold text-ink')}>
                  {activeTab === 'by-cafe' && '카페 기준 닉네임 변경'}
                  {activeTab === 'by-account' && '계정 기준 닉네임 변경'}
                  {activeTab === 'all' && '전체 순회 닉네임 변경'}
                </h2>
                <p className={cn('text-sm text-ink-muted mt-1')}>
                  {activeTab === 'by-cafe' && '선택한 카페에서 모든 계정의 닉네임을 변경합니다'}
                  {activeTab === 'by-account' && '선택한 계정으로 모든 카페의 닉네임을 변경합니다'}
                  {activeTab === 'all' && '모든 계정 × 모든 카페 조합의 닉네임을 변경합니다'}
                </p>
              </SlideUp>
              <NicknameChangeUI mode={activeTab as 'by-cafe' | 'by-account' | 'all'} />
            </div>
          </AnimatedCard>
        )}
      </AnimatedTabs>

      <SlideUp delay={0.2}>
        <details className={cn('mt-8 group')}>
          <summary
            className={cn(
              'flex items-center gap-2 cursor-pointer text-sm text-ink-muted hover:text-ink transition',
              'list-none [&::-webkit-details-marker]:hidden'
            )}
          >
            <motion.svg
              className={cn('w-4 h-4')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              whileHover={{ scale: 1.1 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </motion.svg>
            사용 안내
          </summary>

          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={cn('mt-4 rounded-xl border border-border-light bg-surface-muted p-5')}
          >
            <ul className={cn('text-sm text-ink-muted space-y-2')}>
              <li>
                <span className={cn('font-medium text-ink')}>카페 기준</span>: 선택한 카페에서 모든 계정의 닉네임 변경
              </li>
              <li>
                <span className={cn('font-medium text-ink')}>계정 기준</span>: 선택한 계정으로 모든 카페의 닉네임 변경
              </li>
              <li>
                <span className={cn('font-medium text-ink')}>전체 순회</span>: 모든 계정 × 모든 카페 조합 변경
              </li>
            </ul>
          </motion.div>
        </details>
      </SlideUp>
    </PageLayout>
  );
}
