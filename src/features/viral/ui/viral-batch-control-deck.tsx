'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import type { ExecutionReadiness } from '@/features/viral/viral-batch-ui.helpers';

interface ViralBatchControlDeckProps {
  activeCount: number;
  categories: string[];
  executionReadiness: ExecutionReadiness;
  imageSummary: string;
  keywordCount: number;
  modelLabel: string;
  presetCount: number;
  selectedCafeNames: string[];
}

interface DeckMetricProps {
  detail: string;
  label: string;
  value: string;
}

const DECK_STEPS = [
  {
    detail: '직접 입력 또는 AI 생성으로 실행 큐 구성',
    index: '01',
    title: 'Keyword Prep',
  },
  {
    detail: '카페, 계정 역할, 모델, 이미지 전략 확정',
    index: '02',
    title: 'Routing Setup',
  },
  {
    detail: '스트림 로그 확인 후 결과와 큐 전달 상태 검수',
    index: '03',
    title: 'Result Review',
  },
];

const DeckMetric = ({ detail, label, value }: DeckMetricProps) => {
  return (
    <div className={cn('rounded-[24px] border border-border-light bg-surface/90 px-5 py-4')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-tertiary')}>
        {label}
      </p>
      <p className={cn('mt-2 text-2xl font-semibold tracking-tight text-ink')}>{value}</p>
      <p className={cn('mt-1 text-sm text-ink-muted')}>{detail}</p>
    </div>
  );
};

const getToneClasses = (status: ExecutionReadiness['status']) => {
  if (status === 'ready') {
    return {
      chip: 'border-success/25 bg-success-soft text-success',
      progress: 'bg-success',
      section: 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_84%,var(--success-soft)_16%),color-mix(in_srgb,var(--surface)_95%,var(--success-soft)_5%))]',
    };
  }

  if (status === 'attention') {
    return {
      chip: 'border-warning/25 bg-warning-soft text-warning',
      progress: 'bg-warning',
      section: 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_84%,var(--warning-soft)_16%),color-mix(in_srgb,var(--surface)_95%,var(--warning-soft)_5%))]',
    };
  }

  return {
    chip: 'border-danger/25 bg-danger-soft text-danger',
    progress: 'bg-danger',
    section: 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_84%,var(--danger-soft)_16%),color-mix(in_srgb,var(--surface)_95%,var(--danger-soft)_5%))]',
  };
};

export const ViralBatchControlDeck = ({
  activeCount,
  categories,
  executionReadiness,
  imageSummary,
  keywordCount,
  modelLabel,
  presetCount,
  selectedCafeNames,
}: ViralBatchControlDeckProps) => {
  const toneClasses = getToneClasses(executionReadiness.status);
  const selectedCafeSummary = selectedCafeNames.length > 0 ? selectedCafeNames.join(', ') : '선택 안됨';
  const categorySummary = categories.length > 0 ? categories.join(', ') : '카테고리 없음';

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={cn(
        'overflow-hidden rounded-[32px] border border-border-light shadow-sm',
        toneClasses.section
      )}
    >
      <div className={cn('border-b border-border-light px-6 py-5 lg:px-7')}>
        <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between')}>
          <div className={cn('space-y-2')}>
            <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-info')}>Control Deck</p>
            <div>
              <h2 className={cn('text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]')}>
                현재 실행 구성을 한 번에 점검
              </h2>
              <p className={cn('mt-2 max-w-3xl text-sm leading-6 text-ink-muted sm:text-base')}>
                준비 상태, 대상 범위, 출력 전략을 먼저 고정하고 아래 작업대에서 세부 조건을 조정.
              </p>
            </div>
          </div>

          <div className={cn('min-w-[220px] rounded-[24px] border border-border-light bg-surface/90 px-4 py-4')}>
            <div className={cn('flex items-center justify-between gap-3')}>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.22em] text-ink-tertiary')}>
                Run Status
              </p>
              <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', toneClasses.chip)}>
                {executionReadiness.headline}
              </span>
            </div>
            <p className={cn('mt-3 text-sm font-medium text-ink')}>{executionReadiness.description}</p>
            <div className={cn('mt-4 h-2 rounded-full bg-surface-muted')}>
              <div
                className={cn('h-full rounded-full transition-all duration-300', toneClasses.progress)}
                style={{ width: `${Math.max(executionReadiness.readinessRatio * 100, 8)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={cn('grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:px-7')}>
        <div className={cn('space-y-5')}>
          <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4')}>
            <DeckMetric detail="실행 큐에 적재될 항목 수" label="키워드 큐" value={`${keywordCount}개`} />
            <DeckMetric detail="현재 활성화된 계정 풀" label="계정 풀" value={`${activeCount}개`} />
            <DeckMetric detail="저장해 둔 조합 수" label="프리셋" value={`${presetCount}개`} />
            <DeckMetric detail="본문용 이미지 전략" label="이미지" value={imageSummary} />
          </div>

          <div className={cn('grid gap-3 lg:grid-cols-3')}>
            {DECK_STEPS.map((step) => (
              <div key={step.index} className={cn('rounded-[24px] border border-border-light bg-surface/90 px-5 py-4')}>
                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-tertiary')}>
                  {step.index}
                </p>
                <p className={cn('mt-2 text-base font-semibold text-ink')}>{step.title}</p>
                <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>{step.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={cn('space-y-4 rounded-[28px] border border-border-light bg-surface/90 px-5 py-5')}>
          <div>
            <p className={cn('text-xs font-semibold uppercase tracking-[0.22em] text-ink-tertiary')}>
              Operation Scope
            </p>
            <p className={cn('mt-2 text-sm font-medium text-ink')}>{selectedCafeSummary}</p>
            <p className={cn('mt-2 text-sm leading-6 text-ink-muted')}>{categorySummary}</p>
          </div>

          <div className={cn('grid gap-3 rounded-[24px] bg-surface-muted px-4 py-4')}>
            <div>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>
                Model
              </p>
              <p className={cn('mt-1 text-sm text-ink')}>{modelLabel}</p>
            </div>
            <div>
              <p className={cn('text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary')}>
                Readiness Notes
              </p>
              <div className={cn('mt-2 flex flex-wrap gap-2')}>
                {executionReadiness.checks.map((check) => (
                  <span
                    key={check.label}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium',
                      check.ok
                        ? 'border-success/20 bg-success-soft text-success'
                        : check.required
                          ? 'border-danger/20 bg-danger-soft text-danger'
                          : 'border-warning/20 bg-warning-soft text-warning'
                    )}
                  >
                    {check.label} {check.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
};
