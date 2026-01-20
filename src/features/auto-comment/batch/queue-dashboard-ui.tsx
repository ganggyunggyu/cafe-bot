'use client';

import { useState, useEffect, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/ui';
import {
  getDetailedJobs,
  getQueueSummary,
  clearAllQueues,
  type JobDetail,
  type JobsPage,
  type JobsFilter,
  type QueueSummary,
} from '@/entities/queue';

const STATUS_LABELS: Record<string, string> = {
  delayed: '예약',
  waiting: '대기',
  active: '진행',
  completed: '완료',
  failed: '실패',
};

const TYPE_LABELS: Record<string, string> = {
  post: '글',
  comment: '댓글',
  reply: '대댓글',
};

const STATUS_COLORS: Record<string, string> = {
  delayed: 'bg-(--info-soft) text-(--info)',
  waiting: 'bg-(--surface-muted) text-(--ink-muted)',
  active: 'bg-(--warning-soft) text-(--warning)',
  completed: 'bg-(--success-soft) text-(--success)',
  failed: 'bg-(--danger-soft) text-(--danger)',
};

const TYPE_COLORS: Record<string, string> = {
  post: 'bg-purple-100 text-purple-700',
  comment: 'bg-cyan-100 text-cyan-700',
  reply: 'bg-pink-100 text-pink-700',
};

const formatDelay = (ms: number): string => {
  if (ms < 60000) return `${Math.round(ms / 1000)}초`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}분`;
  return `${Math.round(ms / 3600000)}시간`;
};

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

interface QueueDashboardUIProps {
  onClose?: () => void;
}

export const QueueDashboardUI = ({ onClose }: QueueDashboardUIProps) => {
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [jobsData, setJobsData] = useState<JobsPage | null>(null);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [filter, setFilter] = useState<JobsFilter>({ status: 'all', type: 'all' });
  const [isPolling, setIsPolling] = useState(true);

  const loadData = async () => {
    const [jobsResult, summaryResult] = await Promise.all([
      getDetailedJobs(filter, page, pageSize),
      getQueueSummary(),
    ]);
    setJobsData(jobsResult);
    setSummary(summaryResult);
  };

  useEffect(() => {
    loadData();

    if (!isPolling) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [filter, page, isPolling]);

  const handleClearAll = () => {
    if (!confirm('모든 큐를 클리어하시겠습니까?')) return;
    startTransition(async () => {
      await clearAllQueues();
      loadData();
    });
  };

  const handleFilterChange = (key: keyof JobsFilter, value: string) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const selectClassName = cn(
    'rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--ink)',
    'focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)/10'
  );

  return (
    <div className={cn('space-y-6')}>
      {/* 헤더 */}
      <div className={cn('flex items-center justify-between')}>
        <div>
          <h2 className={cn('text-xl font-bold text-(--ink)')}>큐 대시보드</h2>
          <p className={cn('text-sm text-(--ink-muted) mt-1')}>작업 상세 모니터링</p>
        </div>
        <div className={cn('flex items-center gap-2')}>
          <button
            onClick={() => setIsPolling((p) => !p)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
              isPolling
                ? 'bg-(--success-soft) text-(--success)'
                : 'bg-(--surface-muted) text-(--ink-muted)'
            )}
          >
            {isPolling ? '자동 새로고침' : '새로고침 중지'}
          </button>
          <button
            onClick={handleClearAll}
            disabled={isPending}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
              'bg-(--danger-soft) text-(--danger) hover:bg-(--danger)/10'
            )}
          >
            전체 클리어
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                'border border-(--border) text-(--ink-muted) hover:bg-(--surface-muted)'
              )}
            >
              닫기
            </button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      {summary && (
        <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4')}>
          <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-5')}>
            <h3 className={cn('text-sm font-medium text-(--ink-muted) mb-4')}>전체 상태</h3>
            <div className={cn('grid grid-cols-5 gap-2')}>
              {(['failed', 'active', 'delayed', 'waiting', 'completed'] as const).map((status) => (
                <div key={status} className={cn('text-center')}>
                  <div className={cn('text-xl font-bold text-(--ink)')}>
                    {summary.total[status]}
                  </div>
                  <div className={cn('text-xs text-(--ink-muted)')}>{STATUS_LABELS[status]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-5')}>
            <h3 className={cn('text-sm font-medium text-(--ink-muted) mb-4')}>타입별 (대기중)</h3>
            <div className={cn('flex gap-4')}>
              {(['post', 'comment', 'reply'] as const).map((type) => {
                const pending =
                  summary.byType[type].delayed +
                  summary.byType[type].waiting +
                  summary.byType[type].active;
                return (
                  <div key={type} className={cn('flex-1 text-center')}>
                    <div className={cn('text-xl font-bold text-(--ink)')}>{pending}</div>
                    <div className={cn('text-xs text-(--ink-muted)')}>{TYPE_LABELS[type]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-5')}>
            <h3 className={cn('text-sm font-medium text-(--ink-muted) mb-4')}>카페별 (대기중)</h3>
            <div className={cn('space-y-2')}>
              {summary.byCafe.slice(0, 3).map((cafe) => (
                <div key={cafe.cafeId} className={cn('flex justify-between text-sm')}>
                  <span className={cn('text-(--ink) truncate flex-1')}>{cafe.cafeName}</span>
                  <span className={cn('font-semibold text-(--ink)')}>{cafe.count}</span>
                </div>
              ))}
              {summary.byCafe.length === 0 && (
                <p className={cn('text-sm text-(--ink-muted)')}>대기 중인 작업 없음</p>
              )}
            </div>
          </div>

          <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-5')}>
            <h3 className={cn('text-sm font-medium text-(--ink-muted) mb-4')}>계정별 (대기중)</h3>
            <div className={cn('space-y-2')}>
              {summary.byAccount.slice(0, 3).map((acc) => (
                <div key={acc.accountId} className={cn('flex justify-between text-sm')}>
                  <span className={cn('text-(--ink) truncate flex-1')}>{acc.accountId}</span>
                  <span className={cn('font-semibold text-(--ink)')}>{acc.count}</span>
                </div>
              ))}
              {summary.byAccount.length === 0 && (
                <p className={cn('text-sm text-(--ink-muted)')}>대기 중인 작업 없음</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-4 flex flex-wrap gap-4 items-center')}>
        <Select
          label="상태"
          value={filter.status || 'all'}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          options={[
            { value: 'all', label: '전체' },
            { value: 'delayed', label: '예약' },
            { value: 'waiting', label: '대기' },
            { value: 'active', label: '진행' },
            { value: 'completed', label: '완료' },
            { value: 'failed', label: '실패' },
          ]}
          fullWidth={false}
          className="w-28"
        />

        <Select
          label="타입"
          value={filter.type || 'all'}
          onChange={(e) => handleFilterChange('type', e.target.value)}
          options={[
            { value: 'all', label: '전체' },
            { value: 'post', label: '글' },
            { value: 'comment', label: '댓글' },
            { value: 'reply', label: '대댓글' },
          ]}
          fullWidth={false}
          className="w-28"
        />

        {jobsData && (
          <div className={cn('ml-auto text-sm text-(--ink-muted)')}>
            총 {jobsData.total}건
          </div>
        )}
      </div>

      {/* Jobs 테이블 */}
      <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) overflow-hidden')}>
        <div className={cn('overflow-x-auto')}>
          <table className={cn('w-full text-sm')}>
            <thead>
              <tr className={cn('border-b border-(--border-light) bg-(--surface-muted)')}>
                <th className={cn('px-5 py-4 text-left font-medium text-(--ink-muted)')}>상태</th>
                <th className={cn('px-5 py-4 text-left font-medium text-(--ink-muted)')}>타입</th>
                <th className={cn('px-5 py-4 text-left font-medium text-(--ink-muted)')}>계정</th>
                <th className={cn('px-5 py-4 text-left font-medium text-(--ink-muted)')}>카페</th>
                <th className={cn('px-5 py-4 text-left font-medium text-(--ink-muted)')}>내용</th>
                <th className={cn('px-5 py-4 text-left font-medium text-(--ink-muted)')}>예정/시간</th>
              </tr>
            </thead>
            <tbody>
              {jobsData?.jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
              {(!jobsData || jobsData.jobs.length === 0) && (
                <tr>
                  <td colSpan={6} className={cn('px-5 py-12 text-center text-(--ink-muted)')}>
                    {isPending ? '로딩 중...' : '작업이 없습니다'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {jobsData && jobsData.totalPages > 1 && (
          <div className={cn('flex items-center justify-between border-t border-(--border-light) px-5 py-4')}>
            <div className={cn('text-sm text-(--ink-muted)')}>
              {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, jobsData.total)} / {jobsData.total}
            </div>
            <div className={cn('flex gap-1')}>
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-all',
                  page === 1 ? 'text-(--ink-tertiary)' : 'text-(--ink-muted) hover:bg-(--surface-muted)'
                )}
              >
                ««
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-all',
                  page === 1 ? 'text-(--ink-tertiary)' : 'text-(--ink-muted) hover:bg-(--surface-muted)'
                )}
              >
                «
              </button>
              {Array.from({ length: Math.min(5, jobsData.totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2, jobsData.totalPages - 4)) + i;
                if (pageNum > jobsData.totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                      page === pageNum
                        ? 'bg-(--accent) text-white'
                        : 'text-(--ink-muted) hover:bg-(--surface-muted)'
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(jobsData.totalPages, p + 1))}
                disabled={page === jobsData.totalPages}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-all',
                  page === jobsData.totalPages ? 'text-(--ink-tertiary)' : 'text-(--ink-muted) hover:bg-(--surface-muted)'
                )}
              >
                »
              </button>
              <button
                onClick={() => setPage(jobsData.totalPages)}
                disabled={page === jobsData.totalPages}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-all',
                  page === jobsData.totalPages ? 'text-(--ink-tertiary)' : 'text-(--ink-muted) hover:bg-(--surface-muted)'
                )}
              >
                »»
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const JobRow = ({ job }: { job: JobDetail }) => {
  const getContentDisplay = () => {
    if (job.type === 'post') {
      return (
        <div>
          <div className={cn('font-medium text-(--ink) truncate max-w-[200px]')}>
            {job.subject || job.keyword || '-'}
          </div>
          {job.keyword && job.subject && (
            <div className={cn('text-xs text-(--ink-muted)')}>키워드: {job.keyword}</div>
          )}
        </div>
      );
    }
    return (
      <div>
        <div className={cn('text-(--ink) truncate max-w-[200px]')} title={job.content}>
          {job.content || '-'}
        </div>
        <div className={cn('text-xs text-(--ink-muted)')}>
          #{job.articleId}
          {job.type === 'reply' && ` (댓글 ${job.commentIndex})`}
        </div>
      </div>
    );
  };

  const getTimeDisplay = () => {
    if (job.status === 'delayed' && job.delay) {
      return (
        <div className={cn('text-(--info) font-medium')}>
          {formatDelay(job.delay)} 후
        </div>
      );
    }
    if (job.status === 'active') {
      return <div className={cn('text-(--warning)')}>처리중...</div>;
    }
    if (job.finishedOn) {
      return <div className={cn('text-(--ink-muted)')}>{formatTime(job.finishedOn)}</div>;
    }
    return <div className={cn('text-(--ink-muted)')}>{formatTime(job.createdAt)}</div>;
  };

  return (
    <tr className={cn('border-b border-(--border-light) hover:bg-(--surface-muted) transition-all')}>
      <td className={cn('px-5 py-4')}>
        <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', STATUS_COLORS[job.status])}>
          {STATUS_LABELS[job.status]}
        </span>
      </td>
      <td className={cn('px-5 py-4')}>
        <span className={cn('px-2.5 py-1 rounded-lg text-xs font-medium', TYPE_COLORS[job.type])}>
          {TYPE_LABELS[job.type]}
        </span>
      </td>
      <td className={cn('px-5 py-4 text-(--ink)')}>{job.accountId}</td>
      <td className={cn('px-5 py-4 text-(--ink)')}>
        <span className={cn('truncate max-w-[120px] block')} title={job.cafeName}>
          {job.cafeName || job.cafeId}
        </span>
      </td>
      <td className={cn('px-5 py-4')}>{getContentDisplay()}</td>
      <td className={cn('px-5 py-4')}>{getTimeDisplay()}</td>
    </tr>
  );
};
