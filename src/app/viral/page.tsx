'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { AnimatedCard, AnimatedTabs, PageLayout, SlideUp } from '@/shared/ui';
import { ManualPostUI } from '@/features/manual-post';
import { ViralBatchUI } from '@/features/viral/viral-batch-ui';

const TABS = [
  { id: 'viral', label: '바이럴 배치' },
  { id: 'manual', label: '수동 발행' },
];

const WORKFLOW_STEPS = [
  {
    detail: '직접 입력과 AI 생성을 섞어 실행 큐를 만든다.',
    index: '01',
    title: 'Keyword Prep',
  },
  {
    detail: '카페, 계정 역할, 모델, 이미지 전략을 확정한다.',
    index: '02',
    title: 'Routing Setup',
  },
  {
    detail: '실시간 로그를 보고 결과와 큐 전달 상태를 검수한다.',
    index: '03',
    title: 'Result Review',
  },
];

const REVIEW_RULES = [
  '태그 규칙과 댓글 구조를 먼저 검수',
  '실패 원인은 결과 콘솔에서 바로 확인',
  '디버그 화면에서 AI 원문과 파싱 결과 비교',
];

const GUIDE_CARDS = [
  {
    body: '`[댓글N]`, `[작성자-N]`, `[댓글러-N]`, `[제3자-N]` 형식을 유지해야 파싱이 안정적.',
    title: '댓글 태그 규칙',
  },
  {
    body: 'AI 1회 호출로 제목, 본문, 댓글, 대댓글까지 생성하며 결과 콘솔에서 전체 흐름을 검수.',
    title: '출력 구조',
  },
  {
    body: '모델 선택, 이미지 전략, 계정 역할은 우측 요약 패널과 설정 섹션에서 같은 맥락으로 보이게 정리.',
    title: '운영 포인트',
  },
];

const TAB_META = {
  manual: {
    description: '폴더 기반으로 준비된 원고를 선택해 수동 발행 흐름을 정리.',
    label: 'Manual Publish',
    pills: ['원고 업로드', '수동 검수'],
  },
  viral: {
    description: '키워드 작성부터 결과 확인까지 같은 화면에서 이어지는 배치 작업대.',
    label: 'Batch Workspace',
    pills: ['실시간 로그', '프리셋 복원', '큐 전달'],
  },
} as const;

export default function ViralPage() {
  return (
    <PageLayout
      title="Viral Control Room"
      subtitle="Campaign Operations"
      description="키워드 설계, 실행 설정, 결과 검수를 한 화면에서 운영."
    >
      <SlideUp>
        <div className={cn('grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]')}>
          <section
            className={cn(
              'overflow-hidden rounded-[32px] border border-(--border-light) bg-[linear-gradient(135deg,color-mix(in_srgb,var(--surface)_92%,var(--info-soft)_8%),color-mix(in_srgb,var(--surface)_96%,var(--surface-muted)_4%))] p-6 shadow-sm sm:p-7'
            )}
          >
            <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-(--info)')}>
              Workflow
            </p>
            <h2 className={cn('mt-3 text-[30px] font-semibold tracking-tight text-(--ink) sm:text-[34px]')}>
              작업 흐름을 먼저 고정
            </h2>
            <p className={cn('mt-3 max-w-2xl text-sm leading-7 text-(--ink-muted) sm:text-base')}>
              상단에서 운영 리듬을 잡고, 아래 작업대에서 세부 입력과 실행을 마무리.
            </p>

            <div className={cn('mt-6 grid gap-3 lg:grid-cols-3')}>
              {WORKFLOW_STEPS.map((step) => (
                <div
                  key={step.index}
                  className={cn('rounded-[24px] border border-(--border-light) bg-(--surface)/90 px-5 py-4')}
                >
                  <p className={cn('text-[11px] font-semibold uppercase tracking-[0.22em] text-(--ink-tertiary)')}>
                    {step.index}
                  </p>
                  <p className={cn('mt-2 text-base font-semibold text-(--ink)')}>{step.title}</p>
                  <p className={cn('mt-2 text-sm leading-6 text-(--ink-muted)')}>{step.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <aside
            className={cn(
              'overflow-hidden rounded-[32px] border border-(--border-light) bg-(--surface) p-6 shadow-sm sm:p-7'
            )}
          >
            <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-(--info)')}>
              Review Rules
            </p>
            <h2 className={cn('mt-3 text-2xl font-semibold tracking-tight text-(--ink)')}>
              검수 기준을 같이 본다
            </h2>
            <div className={cn('mt-5 space-y-3')}>
              {REVIEW_RULES.map((rule) => (
                <div
                  key={rule}
                  className={cn('rounded-[22px] border border-(--border-light) bg-(--surface-muted) px-4 py-4 text-sm text-(--ink)')}
                >
                  {rule}
                </div>
              ))}
            </div>

            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className={cn('mt-5')}>
              <Link
                href="/viral/debug"
                className={cn(
                  'flex items-center justify-between rounded-[24px] border border-(--border-light) bg-(--surface-muted) px-4 py-4',
                  'transition-colors hover:bg-(--surface)'
                )}
              >
                <div>
                  <p className={cn('text-sm font-semibold text-(--ink)')}>AI 응답 디버그</p>
                  <p className={cn('mt-1 text-sm text-(--ink-muted)')}>원문과 파싱 결과 확인</p>
                </div>
                <span className={cn('text-sm font-medium text-(--info)')}>열기</span>
              </Link>
            </motion.div>
          </aside>
        </div>
      </SlideUp>

      <SlideUp delay={0.08}>
        <div className={cn('rounded-[32px] border border-(--border-light) bg-(--surface)/80 p-3 shadow-sm backdrop-blur-sm sm:p-4')}>
          <AnimatedTabs tabs={TABS} defaultTab="viral">
            {(activeTab) => {
              const meta = TAB_META[activeTab as keyof typeof TAB_META];

              return (
                <AnimatedCard className={cn('border-none bg-transparent p-0 shadow-none')} hoverScale={1}>
                  <div className={cn('space-y-6')}>
                    <div className={cn('rounded-[28px] border border-(--border-light) bg-(--surface-muted) px-5 py-5 sm:px-6')}>
                      <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between')}>
                        <div>
                          <p className={cn('text-xs font-semibold uppercase tracking-[0.24em] text-(--info)')}>
                            {meta.label}
                          </p>
                          <h2 className={cn('mt-2 text-xl font-semibold tracking-tight text-(--ink)')}>
                            {activeTab === 'viral' ? '바이럴 배치 실행' : '수동 원고 발행'}
                          </h2>
                          <p className={cn('mt-2 text-sm leading-6 text-(--ink-muted)')}>
                            {meta.description}
                          </p>
                        </div>

                        <div className={cn('flex flex-wrap gap-2')}>
                          {meta.pills.map((pill) => (
                            <span
                              key={pill}
                              className={cn('rounded-full border border-(--border-light) bg-(--surface) px-3 py-1 text-xs font-medium text-(--ink)')}
                            >
                              {pill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {activeTab === 'viral' ? <ViralBatchUI /> : <ManualPostUI />}
                  </div>
                </AnimatedCard>
              );
            }}
          </AnimatedTabs>
        </div>
      </SlideUp>

      <SlideUp delay={0.16}>
        <div className={cn('grid gap-4 lg:grid-cols-3')}>
          {GUIDE_CARDS.map((card) => (
            <div
              key={card.title}
              className={cn('rounded-[28px] border border-(--border-light) bg-(--surface) px-5 py-5 shadow-sm')}
            >
              <p className={cn('text-sm font-semibold text-(--ink)')}>{card.title}</p>
              <p className={cn('mt-3 text-sm leading-6 text-(--ink-muted)')}>{card.body}</p>
            </div>
          ))}
        </div>
      </SlideUp>
    </PageLayout>
  );
}
