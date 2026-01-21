'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import {
  getViralDebugList,
  getViralDebugById,
  clearViralDebug,
  type ViralDebugEntry,
} from './viral-debug';

export const ViralDebugUI = () => {
  const [entries, setEntries] = useState<ViralDebugEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ViralDebugEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'response' | 'prompt'>('response');
  const [searchQuery, setSearchQuery] = useState('');

  const loadEntries = async () => {
    setIsLoading(true);
    const list = await getViralDebugList();
    setEntries(list);
    setIsLoading(false);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleSelect = async (id: string) => {
    const entry = await getViralDebugById(id);
    setSelectedEntry(entry);
  };

  const handleClear = async () => {
    if (!confirm('모든 디버그 로그를 삭제하시겠습니까?')) return;
    const count = await clearViralDebug();
    alert(`${count}개 삭제됨`);
    setEntries([]);
    setSelectedEntry(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.keyword.toLowerCase().includes(query) ||
      entry.parsedTitle?.toLowerCase().includes(query)
    );
  });

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('flex items-center justify-between')}>
        <h3 className={cn('font-semibold text-(--ink)')}>AI 응답 디버그</h3>
        <div className={cn('flex gap-2')}>
          <Button variant="secondary" size="xs" onClick={loadEntries}>
            새로고침
          </Button>
          <Button variant="danger" size="xs" onClick={handleClear}>
            전체 삭제
          </Button>
        </div>
      </div>

      <div className={cn('grid grid-cols-3 gap-4 h-[600px]')}>
        <div
          className={cn(
            'col-span-1 rounded-xl border border-(--border) bg-white/50 overflow-hidden'
          )}
        >
          <div className={cn('p-3 border-b border-(--border) bg-gray-50/50 space-y-2')}>
            <p className={cn('text-xs font-medium text-(--ink-muted)')}>
              로그 목록 ({filteredEntries.length}/{entries.length}개)
            </p>
            <input
              type="text"
              placeholder="키워드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full px-2.5 py-1.5 text-xs rounded-lg border border-(--border)',
                'bg-white focus:outline-none focus:ring-1 focus:ring-(--accent)'
              )}
            />
          </div>
          <div className={cn('overflow-y-auto h-[calc(100%-80px)]')}>
            {isLoading ? (
              <p className={cn('p-4 text-sm text-(--ink-muted)')}>로딩 중...</p>
            ) : filteredEntries.length === 0 ? (
              <p className={cn('p-4 text-sm text-(--ink-muted)')}>
                {entries.length === 0 ? '로그 없음' : '검색 결과 없음'}
              </p>
            ) : (
              filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleSelect(entry.id)}
                  className={cn(
                    'w-full p-3 text-left border-b border-(--border) hover:bg-gray-50 transition',
                    selectedEntry?.id === entry.id && 'bg-blue-50'
                  )}
                >
                  <div className={cn('flex items-center justify-between mb-1')}>
                    <span className={cn('text-sm font-medium text-(--ink) truncate')}>
                      {entry.keyword}
                    </span>
                    {entry.parseError ? (
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          'bg-rose-100 text-rose-600'
                        )}
                      >
                        실패
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          'bg-emerald-100 text-emerald-600'
                        )}
                      >
                        성공
                      </span>
                    )}
                  </div>
                  <div className={cn('text-[10px] text-(--ink-muted)')}>
                    {formatDate(entry.createdAt)}
                    {entry.parsedComments !== undefined && (
                      <span className={cn('ml-2')}>댓글 {entry.parsedComments}개</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div
          className={cn(
            'col-span-2 rounded-xl border border-(--border) bg-white/50 overflow-hidden'
          )}
        >
          {selectedEntry ? (
            <>
              <div className={cn('p-3 border-b border-(--border) bg-gray-50/50')}>
                <div className={cn('flex items-center justify-between')}>
                  <div>
                    <p className={cn('text-sm font-medium text-(--ink)')}>
                      {selectedEntry.keyword}
                    </p>
                    <p className={cn('text-[10px] text-(--ink-muted)')}>
                      {selectedEntry.parsedTitle || '(제목 파싱 실패)'}
                    </p>
                  </div>
                  <div className={cn('flex gap-1')}>
                    <Button
                      variant={activeTab === 'response' ? 'primary' : 'ghost'}
                      size="xs"
                      onClick={() => setActiveTab('response')}
                    >
                      응답
                    </Button>
                    <Button
                      variant={activeTab === 'prompt' ? 'primary' : 'ghost'}
                      size="xs"
                      onClick={() => setActiveTab('prompt')}
                    >
                      프롬프트
                    </Button>
                  </div>
                </div>
              </div>
              <div className={cn('p-4 overflow-y-auto h-[calc(100%-72px)]')}>
                <pre
                  className={cn(
                    'text-xs text-(--ink) whitespace-pre-wrap font-mono leading-relaxed'
                  )}
                >
                  {activeTab === 'response' ? selectedEntry.response : selectedEntry.prompt}
                </pre>
              </div>
            </>
          ) : (
            <div className={cn('flex items-center justify-center h-full')}>
              <p className={cn('text-sm text-(--ink-muted)')}>로그를 선택하세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
