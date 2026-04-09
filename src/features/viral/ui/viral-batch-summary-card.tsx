'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { getCompletionMetrics, type ViralPartialResult } from '@/features/viral/viral-batch-ui.helpers';

interface ViralBatchSummaryCardProps {
  activeCount: number;
  blockers: string[];
  canRun: boolean;
  categoryCount: number;
  commenterCount: number;
  imageSummary: string;
  isPending: boolean;
  keywordCount: number;
  modelLabel: string;
  onRunClick: () => void;
  partialResults: ViralPartialResult[];
  readinessCount: number;
  readinessTotal: number;
  selectedCafeCount: number;
  selectedCafeNames: string[];
  writerCount: number;
}

interface SummaryMetricProps {
  detail: string;
  label: string;
  value: string;
}

const SummaryMetric = ({ detail, label, value }: SummaryMetricProps) => {
  return (
    <div className={cn('rounded-[22px] border border-border-light bg-surface px-4 py-4')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>
        {label}
      </p>
      <p className={cn('mt-2 text-xl font-semibold tracking-tight text-ink')}>{value}</p>
      <p className={cn('mt-1 text-sm text-ink-muted')}>{detail}</p>
    </div>
  );
};

export const ViralBatchSummaryCard = ({
  activeCount,
  blockers,
  canRun,
  categoryCount,
  commenterCount,
  imageSummary,
  isPending,
  keywordCount,
  modelLabel,
  onRunClick,
  partialResults,
  readinessCount,
  readinessTotal,
  selectedCafeCount,
  selectedCafeNames,
  writerCount,
}: ViralBatchSummaryCardProps) => {
  const completionMetrics = getCompletionMetrics(partialResults, keywordCount);
  const selectedCafeSummary = selectedCafeNames.length > 0 ? selectedCafeNames.join(', ') : '선택 안됨';
  const readinessRatio = readinessTotal === 0 ? 0 : readinessCount / readinessTotal;
  const statusChipClassName = isPending
    ? 'border-info/20 bg-info-soft text-info'
    : canRun
      ? 'border-success/20 bg-success-soft text-success'
      : 'border-warning/20 bg-warning-soft text-warning';
  const statusLabel = isPending ? '실행 중' : canRun ? '실행 가능' : '준비 필요';

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('space-y-5 xl:sticky xl:top-24')}
    >
      <section
        className={cn(
          'overflow-hidden rounded-[32px] border border-border-light shadow-[0_24px_60px_rgba(15,23,42,0.12)]',
          'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface)_90%,var(--accent-soft)_10%),color-mix(in_srgb,var(--surface)_96%,var(--info-soft)_4%))]'
        )}
      >
        <div className={cn('border-b border-border-light px-6 py-5')}>
          <div className={cn('flex items-start justify-between gap-4')}>
            <div>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Run Summary</p>
              <h3 className={cn('mt-2 text-[26px] font-semibold tracking-tight text-ink')}>
                실행 요약 패널
              </h3>
              <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>
                준비 상태, 대상 범위, 실시간 처리 현황을 같은 시야에 배치.
              </p>
            </div>
            <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', statusChipClassName)}>
              {statusLabel}
            </span>
          </div>

          <div className={cn('mt-4 h-2 overflow-hidden rounded-full bg-surface-muted')}>
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                isPending ? 'bg-info' : canRun ? 'bg-success' : 'bg-warning'
              )}
              style={{ width: `${Math.max(readinessRatio * 100, 8)}%` }}
            />
          </div>
          <p className={cn('mt-3 text-sm text-ink-muted')}>
            준비 체크 {readinessCount}/{readinessTotal}
          </p>
        </div>

        <div className={cn('space-y-5 px-6 py-6')}>
          <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-1')}>
            <SummaryMetric detail="실행 큐에 적재될 항목 수" label="키워드" value={`${keywordCount}개`} />
            <SummaryMetric detail="현재 선택된 타깃 카페" label="카페" value={`${selectedCafeCount}개`} />
            <SummaryMetric detail="운영 가능한 활성 계정 수" label="활성 계정" value={`${activeCount}개`} />
            <SummaryMetric detail="연결된 카테고리 범위" label="카테고리" value={`${categoryCount}개`} />
          </div>

          <div className={cn('rounded-[24px] border border-border-light bg-surface px-4 py-4')}>
            <p className={cn('text-sm font-semibold text-ink')}>실행 조건</p>
            {blockers.length > 0 ? (
              <div className={cn('mt-3 space-y-2')}>
                {blockers.map((blocker) => (
                  <div
                    key={blocker}
                    className={cn('rounded-[18px] border border-warning/20 bg-warning-soft px-4 py-3 text-sm text-warning')}
                  >
                    {blocker}
                  </div>
                ))}
              </div>
            ) : (
              <div className={cn('mt-3 rounded-[18px] border border-success/20 bg-success-soft px-4 py-3 text-sm text-success')}>
                필수 조건이 모두 채워졌습니다. 바로 실행 가능합니다.
              </div>
            )}
          </div>

          <div className={cn('rounded-[24px] border border-border-light bg-surface px-4 py-4')}>
            <p className={cn('text-sm font-semibold text-ink')}>실시간 텔레메트리</p>
            <div className={cn('mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1')}>
              <div className={cn('rounded-[18px] bg-surface-muted px-4 py-3')}>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary')}>성공</p>
                <p className={cn('mt-1 text-lg font-semibold text-success')}>{completionMetrics.successCount}개</p>
              </div>
              <div className={cn('rounded-[18px] bg-surface-muted px-4 py-3')}>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary')}>실패</p>
                <p className={cn('mt-1 text-lg font-semibold text-danger')}>{completionMetrics.failureCount}개</p>
              </div>
              <div className={cn('rounded-[18px] bg-surface-muted px-4 py-3')}>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary')}>대기</p>
                <p className={cn('mt-1 text-lg font-semibold text-ink')}>{completionMetrics.pendingCount}개</p>
              </div>
            </div>
            <p className={cn('mt-3 text-sm text-ink-muted')}>
              {isPending ? '하단 결과 콘솔에 스트림 로그가 실시간으로 누적되는 중.' : '실행 전에는 준비 상태와 설정 범위를 먼저 확인.'}
            </p>
          </div>

          <div className={cn('space-y-3 rounded-[24px] border border-border-light bg-surface px-4 py-4')}>
            <div>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>선택 카페</p>
              <p className={cn('mt-2 text-sm leading-6 text-ink')}>{selectedCafeSummary}</p>
            </div>
            <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-1')}>
              <div>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>AI 모델</p>
                <p className={cn('mt-2 text-sm text-ink')}>{modelLabel}</p>
              </div>
              <div>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>이미지 전략</p>
                <p className={cn('mt-2 text-sm text-ink')}>{imageSummary}</p>
              </div>
            </div>
            <div className={cn('grid gap-3 sm:grid-cols-2')}>
              <div className={cn('rounded-[18px] bg-surface-muted px-4 py-3')}>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary')}>글 계정</p>
                <p className={cn('mt-1 text-lg font-semibold text-ink')}>{writerCount}개</p>
              </div>
              <div className={cn('rounded-[18px] bg-surface-muted px-4 py-3')}>
                <p className={cn('text-xs font-semibold uppercase tracking-[0.16em] text-ink-tertiary')}>댓글 계정</p>
                <p className={cn('mt-1 text-lg font-semibold text-ink')}>{commenterCount}개</p>
              </div>
            </div>
          </div>

          <Button
            onClick={onRunClick}
            disabled={!canRun}
            isLoading={isPending}
            size="lg"
            fullWidth
            className={cn('min-h-14 text-base')}
          >
            {canRun ? `바이럴 배치 실행 (${keywordCount}개)` : '실행 조건 확인 필요'}
          </Button>
        </div>
      </section>
    </motion.aside>
  );
};
