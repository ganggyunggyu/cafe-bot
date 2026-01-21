'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { ApiTestUI } from '@/features/auto-comment/batch/api-test-ui';
import { KeywordGeneratorUI } from '@/features/auto-comment/batch/keyword-generator-ui';
import { PageLayout, Button } from '@/shared/ui';

type TabType = 'keyword' | 'api';

const TABS: { id: TabType; label: string }[] = [
  { id: 'keyword', label: '키워드 생성' },
  { id: 'api', label: 'API 테스트' },
];

export default function TestPage() {
  const [activeTab, setActiveTab] = useState<TabType>('keyword');

  return (
    <PageLayout
      title="테스트"
      subtitle="원고/댓글/대댓글 생성 API 테스트"
    >
      <div className={cn('flex gap-2 mb-8')}>
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 lg:p-8')}>
        {activeTab === 'keyword' && (
          <div className={cn('space-y-6')}>
            <div>
              <h2 className={cn('text-lg font-semibold text-(--ink)')}>키워드 생성</h2>
              <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                카테고리 기반 AI 키워드 자동 생성
              </p>
            </div>
            <KeywordGeneratorUI />
          </div>
        )}

        {activeTab === 'api' && (
          <div className={cn('space-y-6')}>
            <div>
              <h2 className={cn('text-lg font-semibold text-(--ink)')}>API 테스트</h2>
              <p className={cn('text-sm text-(--ink-muted) mt-1')}>
                콘텐츠 생성 API 직접 테스트
              </p>
            </div>
            <ApiTestUI />
          </div>
        )}
      </div>
    </PageLayout>
  );
}
