'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { PageLayout, AnimatedTabs, AnimatedCard, SlideUp } from '@/shared/ui';
import { ViralBatchUI } from '@/features/viral/viral-batch-ui';
import { ManualPostUI } from '@/features/manual-post';

const TABS = [
  { id: 'viral', label: '바이럴 배치' },
  { id: 'manual', label: '수동 발행' },
];

export default function ViralPage() {
  return (
    <PageLayout title="바이럴" subtitle="키워드 기반 콘텐츠 자동 생성">
      <AnimatedTabs tabs={TABS} defaultTab="viral">
        {(activeTab) => (
          <AnimatedCard className={cn('p-6 lg:p-8')}>
            {activeTab === 'viral' && (
              <div className={cn('space-y-6')}>
                <SlideUp>
                  <h2 className={cn('text-lg font-semibold text-(--ink)')}>바이럴 배치 실행</h2>
                  <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                    키워드 입력 또는 AI 생성 → 제목/본문/댓글/대댓글 전체 생성 → 자동 발행
                  </p>
                </SlideUp>
                <ViralBatchUI />
              </div>
            )}

            {activeTab === 'manual' && (
              <div className={cn('space-y-6')}>
                <SlideUp>
                  <h2 className={cn('text-lg font-semibold text-(--ink)')}>수동 원고 발행</h2>
                  <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                    폴더 드래그앤드랍으로 원고 일괄 업로드
                  </p>
                </SlideUp>
                <ManualPostUI />
              </div>
            )}
          </AnimatedCard>
        )}
      </AnimatedTabs>

      {/* 도움말 */}
      <SlideUp delay={0.2}>
        <details className={cn('mt-8 group')}>
          <summary
            className={cn(
              'flex items-center gap-2 cursor-pointer text-sm text-(--ink-muted) hover:text-(--ink) transition',
              'list-none [&::-webkit-details-marker]:hidden'
            )}
          >
            <motion.svg
              className={cn('w-4 h-4')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              animate={{ rotate: 0 }}
              whileHover={{ scale: 1.1 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </motion.svg>
            댓글 기호 규칙 및 도움말
          </summary>

          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={cn('mt-4 grid gap-4 lg:grid-cols-2')}
          >
            <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
              <h3 className={cn('font-semibold text-(--ink) mb-3')}>댓글 기호 규칙</h3>
              <ul className={cn('text-sm text-(--ink-muted) space-y-2')}>
                <li className={cn('flex items-center gap-3')}>
                  <code className={cn('text-xs bg-(--surface) px-2 py-1 rounded-lg border border-(--border-light)')}>댓글N</code>
                  <span>일반 댓글</span>
                </li>
                <li className={cn('flex items-center gap-3')}>
                  <code className={cn('text-xs bg-(--surface) px-2 py-1 rounded-lg border border-(--border-light)')}>☆댓글N</code>
                  <span>원글 작성자 답댓글</span>
                </li>
                <li className={cn('flex items-center gap-3')}>
                  <code className={cn('text-xs bg-(--surface) px-2 py-1 rounded-lg border border-(--border-light)')}>★댓글N</code>
                  <span>댓글 작성자 답변</span>
                </li>
                <li className={cn('flex items-center gap-3')}>
                  <code className={cn('text-xs bg-(--surface) px-2 py-1 rounded-lg border border-(--border-light)')}>○댓글N</code>
                  <span>제3자 답댓글</span>
                </li>
              </ul>
            </div>

            <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
              <h3 className={cn('font-semibold text-(--ink) mb-3')}>바이럴 배치 특징</h3>
              <ul className={cn('text-sm text-(--ink-muted) space-y-1.5')}>
                <li>• 키워드 자동 분류 (자사/타사)</li>
                <li>• AI 1회 호출로 전체 구조 생성</li>
                <li>• 맥락에 맞는 댓글 흐름</li>
                <li>• 댓글 기호 자동 파싱</li>
              </ul>
            </div>
          </motion.div>
        </details>
      </SlideUp>

      {/* 디버그 링크 */}
      <SlideUp delay={0.3}>
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Link
            href="/viral/debug"
            className={cn(
              'mt-6 flex items-center justify-between rounded-xl border border-(--border-light) bg-(--surface) p-4',
              'hover:bg-(--surface-muted) hover:shadow-md transition-all'
            )}
          >
            <div>
              <p className={cn('text-sm font-medium text-(--ink)')}>AI 응답 디버그</p>
              <p className={cn('text-xs text-(--ink-muted)')}>AI 응답과 파싱 결과 확인</p>
            </div>
            <motion.svg
              className={cn('w-5 h-5 text-(--ink-muted)')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              whileHover={{ x: 4 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </motion.svg>
          </Link>
        </motion.div>
      </SlideUp>
    </PageLayout>
  );
}
