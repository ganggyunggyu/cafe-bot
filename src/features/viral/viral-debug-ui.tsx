'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/shared/lib/cn';
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

  return (
    <div className={cn('space-y-4')}>
      <div className={cn('flex items-center justify-between')}>
        <h3 className={cn('font-semibold text-(--ink)')}>AI 응답 디버그</h3>
        <div className={cn('flex gap-2')}>
          <button
            onClick={loadEntries}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            새로고침
          </button>
          <button
            onClick={handleClear}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-rose-50 text-rose-600 hover:bg-rose-100'
            )}
          >
            전체 삭제
          </button>
        </div>
      </div>

      <div className={cn('grid grid-cols-3 gap-4 h-[600px]')}>
        <div
          className={cn(
            'col-span-1 rounded-xl border border-(--border) bg-white/50 overflow-hidden'
          )}
        >
          <div className={cn('p-3 border-b border-(--border) bg-gray-50/50')}>
            <p className={cn('text-xs font-medium text-(--ink-muted)')}>
              로그 목록 ({entries.length}개)
            </p>
          </div>
          <div className={cn('overflow-y-auto h-[calc(100%-48px)]')}>
            {isLoading ? (
              <p className={cn('p-4 text-sm text-(--ink-muted)')}>로딩 중...</p>
            ) : entries.length === 0 ? (
              <p className={cn('p-4 text-sm text-(--ink-muted)')}>로그 없음</p>
            ) : (
              entries.map((entry) => (
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
                    <button
                      onClick={() => setActiveTab('response')}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition',
                        activeTab === 'response'
                          ? 'bg-(--accent) text-white'
                          : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      응답
                    </button>
                    <button
                      onClick={() => setActiveTab('prompt')}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-medium transition',
                        activeTab === 'prompt'
                          ? 'bg-(--accent) text-white'
                          : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      프롬프트
                    </button>
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
