'use client';

import { useState, useEffect, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import {
  getDetailedJobs,
  getQueueSummary,
  clearAllQueues,
  type JobDetail,
  type JobsPage,
  type JobsFilter,
  type QueueSummary,
} from './queue-actions';

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
  delayed: 'bg-blue-100 text-blue-700 border-blue-200',
  waiting: 'bg-gray-100 text-gray-700 border-gray-200',
  active: 'bg-amber-100 text-amber-700 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-100 text-rose-700 border-rose-200',
};

const TYPE_COLORS: Record<string, string> = {
  post: 'bg-purple-100 text-purple-700',
  comment: 'bg-cyan-100 text-cyan-700',
  reply: 'bg-pink-100 text-pink-700',
};

function formatDelay(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}초`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}분`;
  return `${Math.round(ms / 3600000)}시간`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface QueueDashboardUIProps {
  onClose?: () => void;
}

export function QueueDashboardUI({ onClose }: QueueDashboardUIProps) {
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

  const cardClassName = cn(
    'rounded-2xl border border-(--border) bg-white/70 backdrop-blur-sm p-4 shadow-sm'
  );

  return (
    <div className={cn('space-y-6')}>
      {/* 헤더 */}
      <div className={cn('flex items-center justify-between')}>
        <div>
          <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>큐 대시보드</h2>
          <p className={cn('text-sm text-(--ink-muted)')}>작업 상세 모니터링</p>
        </div>
        <div className={cn('flex items-center gap-2')}>
          <button
            onClick={() => setIsPolling((p) => !p)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium transition border',
              isPolling
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            )}
          >
            {isPolling ? '자동 새로고침 중' : '새로고침 중지됨'}
          </button>
          <button
            onClick={handleClearAll}
            disabled={isPending}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium transition',
              'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
            )}
          >
            전체 클리어
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-medium transition',
                'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
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
          {/* 전체 통계 */}
          <div className={cardClassName}>
            <h3 className={cn('text-xs font-medium text-(--ink-muted) mb-3')}>전체 상태</h3>
            <div className={cn('grid grid-cols-5 gap-2')}>
              {(['delayed', 'waiting', 'active', 'completed', 'failed'] as const).map((status) => (
                <div key={status} className={cn('text-center')}>
                  <div className={cn('text-lg font-bold text-(--ink)')}>
                    {summary.total[status]}
                  </div>
                  <div className={cn('text-[10px] text-(--ink-muted)')}>{STATUS_LABELS[status]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 타입별 통계 */}
          <div className={cardClassName}>
            <h3 className={cn('text-xs font-medium text-(--ink-muted) mb-3')}>타입별 (대기중)</h3>
            <div className={cn('flex gap-4')}>
              {(['post', 'comment', 'reply'] as const).map((type) => {
                const pending =
                  summary.byType[type].delayed +
                  summary.byType[type].waiting +
                  summary.byType[type].active;
                return (
                  <div key={type} className={cn('flex-1 text-center')}>
                    <div className={cn('text-lg font-bold text-(--ink)')}>{pending}</div>
                    <div className={cn('text-[10px] text-(--ink-muted)')}>{TYPE_LABELS[type]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 카페별 (상위 3개) */}
          <div className={cardClassName}>
            <h3 className={cn('text-xs font-medium text-(--ink-muted) mb-3')}>카페별 (대기중)</h3>
            <div className={cn('space-y-1')}>
              {summary.byCafe.slice(0, 3).map((cafe) => (
                <div key={cafe.cafeId} className={cn('flex justify-between text-sm')}>
                  <span className={cn('text-(--ink) truncate flex-1')}>{cafe.cafeName}</span>
                  <span className={cn('font-medium text-(--ink)')}>{cafe.count}</span>
                </div>
              ))}
              {summary.byCafe.length === 0 && (
                <p className={cn('text-xs text-(--ink-muted)')}>대기 중인 작업 없음</p>
              )}
            </div>
          </div>

          {/* 계정별 (상위 3개) */}
          <div className={cardClassName}>
            <h3 className={cn('text-xs font-medium text-(--ink-muted) mb-3')}>계정별 (대기중)</h3>
            <div className={cn('space-y-1')}>
              {summary.byAccount.slice(0, 3).map((acc) => (
                <div key={acc.accountId} className={cn('flex justify-between text-sm')}>
                  <span className={cn('text-(--ink) truncate flex-1')}>{acc.accountId}</span>
                  <span className={cn('font-medium text-(--ink)')}>{acc.count}</span>
                </div>
              ))}
              {summary.byAccount.length === 0 && (
                <p className={cn('text-xs text-(--ink-muted)')}>대기 중인 작업 없음</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className={cn(cardClassName, 'flex flex-wrap gap-3')}>
        <div className={cn('flex items-center gap-2')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>상태</label>
          <select
            value={filter.status || 'all'}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className={cn(
              'rounded-lg border border-(--border) bg-white px-2 py-1 text-sm'
            )}
          >
            <option value="all">전체</option>
            <option value="delayed">예약</option>
            <option value="waiting">대기</option>
            <option value="active">진행</option>
            <option value="completed">완료</option>
            <option value="failed">실패</option>
          </select>
        </div>

        <div className={cn('flex items-center gap-2')}>
          <label className={cn('text-xs font-medium text-(--ink-muted)')}>타입</label>
          <select
            value={filter.type || 'all'}
            onChange={(e) => handleFilterChange('type', e.target.value)}
            className={cn(
              'rounded-lg border border-(--border) bg-white px-2 py-1 text-sm'
            )}
          >
            <option value="all">전체</option>
            <option value="post">글</option>
            <option value="comment">댓글</option>
            <option value="reply">대댓글</option>
          </select>
        </div>

        {jobsData && (
          <div className={cn('ml-auto text-xs text-(--ink-muted)')}>
            총 {jobsData.total}건
          </div>
        )}
      </div>

      {/* Jobs 테이블 */}
      <div className={cn(cardClassName, 'overflow-hidden p-0')}>
        <div className={cn('overflow-x-auto')}>
          <table className={cn('w-full text-sm')}>
            <thead>
              <tr className={cn('border-b border-(--border) bg-gray-50/50')}>
                <th className={cn('px-4 py-3 text-left font-medium text-(--ink-muted)')}>상태</th>
                <th className={cn('px-4 py-3 text-left font-medium text-(--ink-muted)')}>타입</th>
                <th className={cn('px-4 py-3 text-left font-medium text-(--ink-muted)')}>계정</th>
                <th className={cn('px-4 py-3 text-left font-medium text-(--ink-muted)')}>카페</th>
                <th className={cn('px-4 py-3 text-left font-medium text-(--ink-muted)')}>내용</th>
                <th className={cn('px-4 py-3 text-left font-medium text-(--ink-muted)')}>예정/시간</th>
              </tr>
            </thead>
            <tbody>
              {jobsData?.jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
              {(!jobsData || jobsData.jobs.length === 0) && (
                <tr>
                  <td colSpan={6} className={cn('px-4 py-8 text-center text-(--ink-muted)')}>
                    {isPending ? '로딩 중...' : '작업이 없습니다'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {jobsData && jobsData.totalPages > 1 && (
          <div className={cn('flex items-center justify-between border-t border-(--border) px-4 py-3')}>
            <div className={cn('text-xs text-(--ink-muted)')}>
              {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, jobsData.total)} / {jobsData.total}
            </div>
            <div className={cn('flex gap-1')}>
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className={cn(
                  'px-2 py-1 rounded text-xs transition',
                  page === 1 ? 'text-gray-300' : 'text-(--ink-muted) hover:bg-gray-100'
                )}
              >
                ««
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={cn(
                  'px-2 py-1 rounded text-xs transition',
                  page === 1 ? 'text-gray-300' : 'text-(--ink-muted) hover:bg-gray-100'
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
                      'px-3 py-1 rounded text-xs transition',
                      page === pageNum
                        ? 'bg-(--accent) text-white'
                        : 'text-(--ink-muted) hover:bg-gray-100'
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
                  'px-2 py-1 rounded text-xs transition',
                  page === jobsData.totalPages ? 'text-gray-300' : 'text-(--ink-muted) hover:bg-gray-100'
                )}
              >
                »
              </button>
              <button
                onClick={() => setPage(jobsData.totalPages)}
                disabled={page === jobsData.totalPages}
                className={cn(
                  'px-2 py-1 rounded text-xs transition',
                  page === jobsData.totalPages ? 'text-gray-300' : 'text-(--ink-muted) hover:bg-gray-100'
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
}

function JobRow({ job }: { job: JobDetail }) {
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
      <div className={cn('text-(--ink)')}>
        #{job.articleId}
        {job.type === 'reply' && <span className={cn('text-(--ink-muted)')}> (댓글 {job.commentIndex})</span>}
      </div>
    );
  };

  const getTimeDisplay = () => {
    if (job.status === 'delayed' && job.delay) {
      return (
        <div className={cn('text-blue-600 font-medium')}>
          {formatDelay(job.delay)} 후
        </div>
      );
    }
    if (job.status === 'active') {
      return <div className={cn('text-amber-600')}>처리중...</div>;
    }
    if (job.finishedOn) {
      return <div className={cn('text-(--ink-muted)')}>{formatTime(job.finishedOn)}</div>;
    }
    return <div className={cn('text-(--ink-muted)')}>{formatTime(job.createdAt)}</div>;
  };

  return (
    <tr className={cn('border-b border-(--border) hover:bg-gray-50/50 transition')}>
      <td className={cn('px-4 py-3')}>
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[job.status])}>
          {STATUS_LABELS[job.status]}
        </span>
      </td>
      <td className={cn('px-4 py-3')}>
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', TYPE_COLORS[job.type])}>
          {TYPE_LABELS[job.type]}
        </span>
      </td>
      <td className={cn('px-4 py-3 text-(--ink)')}>{job.accountId}</td>
      <td className={cn('px-4 py-3 text-(--ink)')}>
        <span className={cn('truncate max-w-[120px] block')} title={job.cafeName}>
          {job.cafeName || job.cafeId}
        </span>
      </td>
      <td className={cn('px-4 py-3')}>{getContentDisplay()}</td>
      <td className={cn('px-4 py-3')}>{getTimeDisplay()}</td>
    </tr>
  );
}
