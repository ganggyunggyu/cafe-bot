'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { getCompletionMetrics, type ViralPartialResult } from '@/features/viral/viral-batch-ui.helpers';
import type { ViralBatchResult } from '@/features/viral/viral-batch-job';

interface ViralBatchStatusPanelProps {
  isPending: boolean;
  keywordCount: number;
  partialResults: ViralPartialResult[];
  result: ViralBatchResult | null;
}

interface StatusMetricProps {
  label: string;
  tone?: 'neutral' | 'success' | 'danger';
  value: string;
}

const StatusMetric = ({ label, tone = 'neutral', value }: StatusMetricProps) => {
  return (
    <div className={cn('rounded-[22px] border border-border-light bg-surface px-4 py-4')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tracking-tight',
          tone === 'success'
            ? 'text-success'
            : tone === 'danger'
              ? 'text-danger'
              : 'text-ink'
        )}
      >
        {value}
      </p>
    </div>
  );
};

export const ViralBatchStatusPanel = ({
  isPending,
  keywordCount,
  partialResults,
  result,
}: ViralBatchStatusPanelProps) => {
  const completionMetrics = getCompletionMetrics(partialResults, keywordCount);
  const totalCommentCount = result?.results.reduce((sum, item) => sum + (item.commentCount || 0), 0) || 0;
  const totalReplyCount = result?.results.reduce((sum, item) => sum + (item.replyCount || 0), 0) || 0;
  const progressPercent = result ? 100 : completionMetrics.progressPercent;
  const isIdle = !isPending && !result && partialResults.length === 0;

  return (
    <section className={cn('overflow-hidden rounded-[32px] border border-border-light bg-surface shadow-sm')}>
      <div className={cn('border-b border-border-light px-6 py-5')}>
        <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between')}>
          <div>
            <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Result Console</p>
            <h3 className={cn('mt-2 text-[28px] font-semibold tracking-tight text-ink')}>
              실행 로그와 결과 검수
            </h3>
            <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>
              실시간 피드와 최종 결과를 같은 보드에서 이어서 확인.
            </p>
          </div>

          <div className={cn('min-w-[240px] rounded-[24px] border border-border-light bg-surface-muted px-4 py-4')}>
            <div className={cn('flex items-center justify-between gap-3')}>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>Progress</p>
              <span className={cn('text-sm font-medium text-ink')}>
                {result ? result.totalKeywords : completionMetrics.processedCount}/{keywordCount || 0}
              </span>
            </div>
            <div className={cn('mt-3 h-2 overflow-hidden rounded-full bg-surface')}>
              <div
                className={cn('h-full rounded-full transition-all duration-300', result ? 'bg-success' : 'bg-info')}
                style={{ width: `${Math.max(progressPercent, isPending || result ? 6 : 0)}%` }}
              />
            </div>
            <p className={cn('mt-3 text-xs text-ink-muted')}>
              성공 {result ? result.completed : completionMetrics.successCount} · 실패{' '}
              {result ? result.failed : completionMetrics.failureCount}
            </p>
          </div>
        </div>
      </div>

      <div className={cn('space-y-6 px-6 py-6')}>
        <div className={cn('grid gap-3 md:grid-cols-4')}>
          <StatusMetric label="총 대상" value={`${keywordCount}개`} />
          <StatusMetric label="처리됨" value={`${result ? result.totalKeywords : completionMetrics.processedCount}개`} />
          <StatusMetric
            label="성공"
            tone="success"
            value={`${result ? result.completed : completionMetrics.successCount}개`}
          />
          <StatusMetric
            label="실패"
            tone="danger"
            value={`${result ? result.failed : completionMetrics.failureCount}개`}
          />
        </div>

        {isIdle && (
          <div className={cn('grid gap-4 lg:grid-cols-3')}>
            <div className={cn('rounded-[24px] border border-border-light bg-surface-muted px-5 py-5')}>
              <p className={cn('text-sm font-semibold text-ink')}>실행 전</p>
              <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>
                우측 요약 패널에서 준비 상태와 필수 입력을 먼저 확인.
              </p>
            </div>
            <div className={cn('rounded-[24px] border border-border-light bg-surface-muted px-5 py-5')}>
              <p className={cn('text-sm font-semibold text-ink')}>실행 중</p>
              <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>
                스트림 로그가 순서대로 누적되며 성공과 실패가 즉시 표시.
              </p>
            </div>
            <div className={cn('rounded-[24px] border border-border-light bg-surface-muted px-5 py-5')}>
              <p className={cn('text-sm font-semibold text-ink')}>실행 후</p>
              <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>
                제목, 댓글 수, 실패 원인을 결과 목록에서 바로 검수.
              </p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {(isPending || partialResults.length > 0) && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn(
                'overflow-hidden rounded-[28px] border border-border-light bg-[linear-gradient(180deg,var(--surface),color-mix(in_srgb,var(--info-soft)_55%,var(--surface)))]'
              )}
            >
              <div className={cn('flex flex-col gap-3 border-b border-border-light px-6 py-5 sm:flex-row sm:items-end sm:justify-between')}>
                <div>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Live Feed</p>
                  <h4 className={cn('mt-2 text-xl font-semibold tracking-tight text-ink')}>실시간 처리 로그</h4>
                </div>
                <span className={cn('text-sm text-ink-muted')}>
                  성공 {completionMetrics.successCount} / 실패 {completionMetrics.failureCount}
                </span>
              </div>

              <div className={cn('space-y-2 px-6 py-6')}>
                {partialResults.length === 0 && (
                  <div className={cn('rounded-[22px] border border-border-light bg-surface px-4 py-4 text-sm text-ink-muted')}>
                    스트림 연결 완료. 첫 번째 결과를 기다리는 중.
                  </div>
                )}

                {partialResults.map((item, index) => (
                  <motion.div
                    key={`${item.keyword}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      'flex flex-col gap-2 rounded-[22px] border px-4 py-4 text-sm sm:flex-row sm:items-center sm:gap-3',
                      item.success
                        ? 'border-success/20 bg-success-soft'
                        : 'border-danger/20 bg-danger-soft'
                    )}
                  >
                    <span className={cn('text-base font-semibold', item.success ? 'text-success' : 'text-danger')}>
                      {item.success ? 'OK' : 'ERR'}
                    </span>
                    <span className={cn('font-medium text-ink')}>{item.keyword}</span>
                    {item.success && item.title && (
                      <span className={cn('min-w-0 flex-1 truncate text-ink-muted')}>{item.title}</span>
                    )}
                    {!item.success && item.error && (
                      <span className={cn('min-w-0 flex-1 truncate text-danger/80')}>{item.error}</span>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {result && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className={cn('space-y-4')}
            >
              <motion.div
                initial={{ scale: 0.96 }}
                animate={{ scale: 1 }}
                className={cn(
                  'rounded-[28px] border px-6 py-5',
                  result.success
                    ? 'border-success/30 bg-success-soft'
                    : 'border-warning/30 bg-warning-soft'
                )}
              >
                <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between')}>
                  <div>
                    <p
                      className={cn(
                        'text-xs font-semibold uppercase tracking-[0.24em]',
                        result.success ? 'text-success' : 'text-warning'
                      )}
                    >
                      Batch Result
                    </p>
                    <h4
                      className={cn(
                        'mt-2 text-xl font-semibold tracking-tight',
                        result.success ? 'text-success' : 'text-warning'
                      )}
                    >
                      {result.success ? '배치 완료' : '부분 완료'}
                    </h4>
                    <p className={cn('mt-2 text-sm text-ink-muted')}>
                      댓글 {totalCommentCount}개 · 대댓글 {totalReplyCount}개
                    </p>
                  </div>
                  <div className={cn('text-sm text-ink-muted')}>
                    {result.completed}/{result.totalKeywords} 성공
                  </div>
                </div>
              </motion.div>

              <div className={cn('grid gap-3')}>
                {result.results.map((item, index) => (
                  <motion.div
                    key={`${item.keyword}-${index}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={cn(
                      'rounded-[24px] border px-5 py-4',
                      item.success
                        ? 'border-success/20 bg-success-soft'
                        : 'border-danger/20 bg-danger-soft'
                    )}
                  >
                    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
                      <div className={cn('flex flex-wrap items-center gap-2')}>
                        <span
                          className={cn(
                            'rounded-lg px-2.5 py-1 text-sm font-semibold',
                            item.success ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                          )}
                        >
                          {item.keyword}
                        </span>
                        <span
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-medium',
                            item.keywordType === 'own' ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'
                          )}
                        >
                          {item.keywordType === 'own' ? '자사' : '타사'}
                        </span>
                      </div>

                      {item.success && (
                        <span className={cn('text-sm text-success')}>
                          댓글 {item.commentCount || 0}개, 대댓글 {item.replyCount || 0}개
                        </span>
                      )}
                    </div>

                    {item.success && item.title && (
                      <p className={cn('mt-2 text-sm text-success/80')}>{item.title}</p>
                    )}
                    {!item.success && item.error && (
                      <p className={cn('mt-2 text-sm text-danger/80')}>{item.error}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
