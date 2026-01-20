'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { PostOnlyUI, CommentOnlyUI } from '@/features/auto-comment/publish';
import { PageLayout } from '@/shared/ui';

type TabType = 'post' | 'comment';

const TABS: { id: TabType; label: string }[] = [
  { id: 'post', label: '글만 발행' },
  { id: 'comment', label: '댓글만 달기' },
];

export default function PublishPage() {
  const [activeTab, setActiveTab] = useState<TabType>('post');

  return (
    <PageLayout
      title="분리 발행"
      subtitle="글만 발행하거나, 기존 글에 댓글만 달거나"
    >
      <div className={cn('flex gap-2 mb-8')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-(--accent) text-white'
                : 'bg-(--surface) border border-(--border) text-(--ink-muted) hover:text-(--ink) hover:bg-(--surface-muted)'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8')}>
        {activeTab === 'post' && (
          <div className={cn('space-y-6')}>
            <div>
              <h2 className={cn('text-lg font-semibold text-(--ink)')}>글만 발행</h2>
              <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                댓글 없이 글만 발행 (원고 데이터 축적 용도)
              </p>
            </div>
            <PostOnlyUI />
          </div>
        )}

        {activeTab === 'comment' && (
          <div className={cn('space-y-6')}>
            <div>
              <h2 className={cn('text-lg font-semibold text-(--ink)')}>댓글만 달기</h2>
              <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                기존 글에 댓글/대댓글 자동 추가
              </p>
            </div>
            <CommentOnlyUI />
          </div>
        )}
      </div>

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
          분리 발행 사용법
        </summary>

        <div className={cn('mt-4 grid gap-4 lg:grid-cols-2')}>
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
            <h3 className={cn('font-semibold text-(--ink) mb-3')}>글만 발행</h3>
            <ul className={cn('text-sm text-(--ink-muted) space-y-1.5')}>
              <li>• 키워드 입력 후 발행 버튼 클릭</li>
              <li>• 댓글 없이 글만 발행됨</li>
              <li>• 원고 데이터 축적 용도</li>
            </ul>
          </div>

          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface-muted) p-5')}>
            <h3 className={cn('font-semibold text-(--ink) mb-3')}>댓글만 달기</h3>
            <ul className={cn('text-sm text-(--ink-muted) space-y-1.5')}>
              <li>• 최근 글 중 랜덤 절반 선택</li>
              <li>• 글당 3~15개 (대댓글 50%)</li>
              <li>• 자동으로 댓글/대댓글 추가</li>
            </ul>
          </div>
        </div>

        <p className={cn('mt-4 text-xs text-(--ink-muted)')}>
          글 발행과 댓글을 분리하면 타임라인이 더 자연스러워집니다.
        </p>
      </details>
    </PageLayout>
  );
}
