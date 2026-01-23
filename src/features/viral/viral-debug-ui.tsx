'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { Button, ConfirmModal } from '@/shared/ui';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await getViralDebugList();
      setEntries(list);
    } catch (error) {
      console.error('[DEBUG-UI] 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadEntries();
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSelect = async (id: string) => {
    const entry = await getViralDebugById(id);
    setSelectedEntry(entry);
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await clearViralDebug();
      setEntries([]);
      setSelectedEntry(null);
      setShowClearModal(false);
    } finally {
      setIsClearing(false);
    }
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

  const successCount = entries.filter((e) => !e.parseError).length;
  const failCount = entries.filter((e) => e.parseError).length;

  return (
    <div className={cn('space-y-4')}>
      {/* 전체 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClear}
        title="모든 디버그 로그를 삭제하시겠습니까?"
        description={`총 ${entries.length}개의 로그가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
        variant="danger"
        confirmText="전체 삭제"
        cancelText="취소"
        isLoading={isClearing}
      />

      <div className={cn('flex items-center justify-between')}>
        <div className={cn('flex items-center gap-3')}>
          <h3 className={cn('font-semibold text-(--ink)')}>AI 응답 디버그</h3>
          <div className={cn('flex gap-2 text-xs')}>
            <span
              className={cn(
                'px-2 py-1 rounded-full',
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              )}
            >
              성공 {successCount}
            </span>
            <span
              className={cn(
                'px-2 py-1 rounded-full',
                'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              )}
            >
              실패 {failCount}
            </span>
          </div>
        </div>
        <div className={cn('flex gap-2')}>
          <Button
            variant="secondary"
            size="xs"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? '로딩...' : '새로고침'}
          </Button>
          <Button variant="danger" size="xs" onClick={() => setShowClearModal(true)}>
            전체 삭제
          </Button>
        </div>
      </div>

      <div className={cn('grid grid-cols-3 gap-4 h-[600px]')}>
        {/* 목록 패널 */}
        <div
          className={cn(
            'col-span-1 rounded-xl border overflow-hidden',
            'border-(--border) bg-(--surface)'
          )}
        >
          <div
            className={cn(
              'p-3 border-b space-y-2',
              'border-(--border) bg-(--surface-muted)'
            )}
          >
            <p className={cn('text-xs font-medium text-(--ink-muted)')}>
              로그 목록 ({filteredEntries.length}/{entries.length}개)
            </p>
            <input
              type="text"
              placeholder="키워드 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full px-2.5 py-1.5 text-xs rounded-lg border',
                'border-(--border) bg-(--background)',
                'text-(--ink) placeholder:text-(--ink-muted)',
                'focus:outline-none focus:ring-1 focus:ring-(--accent)'
              )}
            />
          </div>
          <div className={cn('overflow-y-auto h-[calc(100%-80px)]')}>
            {isLoading ? (
              <div className={cn('p-4 text-center')}>
                <div
                  className={cn(
                    'inline-block w-5 h-5 border-2 rounded-full animate-spin',
                    'border-(--ink-muted) border-t-transparent'
                  )}
                />
              </div>
            ) : filteredEntries.length === 0 ? (
              <p className={cn('p-4 text-sm text-(--ink-muted) text-center')}>
                {entries.length === 0 ? '로그 없음' : '검색 결과 없음'}
              </p>
            ) : (
              <AnimatePresence>
                {filteredEntries.map((entry) => (
                  <motion.button
                    key={entry.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={() => handleSelect(entry.id)}
                    className={cn(
                      'w-full p-3 text-left border-b transition-colors',
                      'border-(--border)',
                      selectedEntry?.id === entry.id
                        ? 'bg-(--accent)/10'
                        : 'hover:bg-(--surface-muted)'
                    )}
                  >
                    <div className={cn('flex items-center justify-between mb-1')}>
                      <span
                        className={cn('text-sm font-medium text-(--ink) truncate flex-1')}
                      >
                        {entry.keyword}
                      </span>
                      {entry.parseError ? (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium ml-2',
                            'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          )}
                        >
                          실패
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium ml-2',
                            'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
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
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* 상세 패널 */}
        <div
          className={cn(
            'col-span-2 rounded-xl border overflow-hidden',
            'border-(--border) bg-(--surface)'
          )}
        >
          <AnimatePresence mode="wait">
            {selectedEntry ? (
              <motion.div
                key={selectedEntry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn('h-full flex flex-col')}
              >
                <div
                  className={cn(
                    'p-3 border-b',
                    'border-(--border) bg-(--surface-muted)'
                  )}
                >
                  <div className={cn('flex items-center justify-between')}>
                    <div className={cn('flex-1 min-w-0')}>
                      <p className={cn('text-sm font-medium text-(--ink) truncate')}>
                        {selectedEntry.keyword}
                      </p>
                      <p className={cn('text-[10px] text-(--ink-muted) truncate')}>
                        {selectedEntry.parsedTitle || '(제목 파싱 실패)'}
                      </p>
                    </div>
                    <div className={cn('flex gap-1 ml-3')}>
                      {(['response', 'prompt'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={cn(
                            'relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                            activeTab === tab
                              ? 'text-(--background)'
                              : 'text-(--ink-muted) hover:text-(--ink)'
                          )}
                        >
                          {activeTab === tab && (
                            <motion.div
                              layoutId="debugTab"
                              className={cn('absolute inset-0 bg-(--accent) rounded-lg')}
                              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            />
                          )}
                          <span className={cn('relative z-10')}>
                            {tab === 'response' ? '응답' : '프롬프트'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={cn('flex-1 p-4 overflow-y-auto')}>
                  <motion.pre
                    key={activeTab}
                    initial={{ opacity: 0, x: activeTab === 'response' ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'text-xs whitespace-pre-wrap font-mono leading-relaxed',
                      'text-(--ink)'
                    )}
                  >
                    {activeTab === 'response'
                      ? selectedEntry.response || '(응답 없음)'
                      : selectedEntry.prompt}
                  </motion.pre>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn('flex items-center justify-center h-full')}
              >
                <p className={cn('text-sm text-(--ink-muted)')}>로그를 선택하세요</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
