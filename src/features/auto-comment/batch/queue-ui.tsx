'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/shared/lib/cn';
import { getAllQueueStatus, clearAccountQueue, clearAllQueues, getDetailedJobs, type AllQueueStatus, type JobDetail } from './queue-actions';

export const QueueStatusUI = () => {
  const [status, setStatus] = useState<AllQueueStatus | null>(null);
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showJobList, setShowJobList] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [data, jobsData] = await Promise.all([
        getAllQueueStatus(),
        getDetailedJobs({ status: 'all' }, 1, 50),
      ]);
      setStatus(data);
      setJobs(jobsData.jobs);
    } catch (error) {
      console.error('큐 상태 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleClearAccount = async (accountId: string) => {
    if (!confirm(`${accountId} 큐를 클리어하시겠습니까?`)) return;
    setClearing(accountId);
    try {
      await clearAccountQueue(accountId);
      await fetchStatus();
    } finally {
      setClearing(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('모든 큐를 클리어하시겠습니까?')) return;
    setClearing('all');
    try {
      await clearAllQueues();
      await fetchStatus();
    } finally {
      setClearing(null);
    }
  };

  const hasActiveJobs = status && (status.total.waiting > 0 || status.total.active > 0 || status.total.delayed > 0);
  const totalJobs = status
    ? status.total.waiting + status.total.active + status.total.delayed + status.total.completed + status.total.failed
    : 0;

  return (
    <div className={cn('space-y-4')}>
      {/* 헤더 */}
      <div className={cn(
        'rounded-2xl p-4',
        'bg-gradient-to-br from-slate-50 to-slate-100',
        'border border-slate-200/50 shadow-sm'
      )}>
        <div className={cn('flex items-center justify-between mb-4')}>
          <div className={cn('flex items-center gap-3')}>
            {hasActiveJobs && (
              <span className={cn('relative flex h-3 w-3')}>
                <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75')} />
                <span className={cn('relative inline-flex rounded-full h-3 w-3 bg-blue-500')} />
              </span>
            )}
            <h3 className={cn('font-semibold text-(--ink)')}>큐 상태</h3>
            {loading && (
              <svg className={cn('animate-spin h-4 w-4 text-slate-400')} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
          </div>
          <div className={cn('flex items-center gap-2')}>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className={cn(
                'p-2 rounded-full transition-all',
                'bg-white/80 hover:bg-white border border-slate-200',
                'text-slate-500 hover:text-slate-700',
                'disabled:opacity-50'
              )}
              title="새로고침"
            >
              <svg className={cn('w-4 h-4', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {hasActiveJobs && (
              <button
                onClick={handleClearAll}
                disabled={clearing === 'all'}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full transition-all',
                  'bg-gradient-to-r from-rose-500 to-rose-600 text-white',
                  'hover:from-rose-600 hover:to-rose-700 shadow-sm',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {clearing === 'all' ? (
                  <span className={cn('flex items-center gap-1')}>
                    <svg className={cn('animate-spin h-3 w-3')} fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    클리어 중
                  </span>
                ) : '전체 클리어'}
              </button>
            )}
          </div>
        </div>

        {/* 통계 카드 */}
        {status && (
          <div className={cn('grid grid-cols-5 gap-2')}>
            <StatCard
              label="대기"
              value={status.total.waiting}
              color="amber"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label="진행"
              value={status.total.active}
              color="blue"
              pulse={status.total.active > 0}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            />
            <StatCard
              label="예약"
              value={status.total.delayed}
              color="violet"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
            />
            <StatCard
              label="완료"
              value={status.total.completed}
              color="emerald"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              label="실패"
              value={status.total.failed}
              color="rose"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </div>
        )}

        {/* 진행률 바 */}
        {status && totalJobs > 0 && (
          <div className={cn('mt-4')}>
            <div className={cn('h-2 rounded-full bg-slate-200 overflow-hidden flex')}>
              {status.total.completed > 0 && (
                <div
                  className={cn('h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500')}
                  style={{ width: `${(status.total.completed / totalJobs) * 100}%` }}
                />
              )}
              {status.total.active > 0 && (
                <div
                  className={cn('h-full bg-gradient-to-r from-blue-400 to-blue-500 animate-pulse transition-all duration-500')}
                  style={{ width: `${(status.total.active / totalJobs) * 100}%` }}
                />
              )}
              {status.total.delayed > 0 && (
                <div
                  className={cn('h-full bg-gradient-to-r from-violet-400 to-violet-500 transition-all duration-500')}
                  style={{ width: `${(status.total.delayed / totalJobs) * 100}%` }}
                />
              )}
              {status.total.waiting > 0 && (
                <div
                  className={cn('h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500')}
                  style={{ width: `${(status.total.waiting / totalJobs) * 100}%` }}
                />
              )}
              {status.total.failed > 0 && (
                <div
                  className={cn('h-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500')}
                  style={{ width: `${(status.total.failed / totalJobs) * 100}%` }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 계정별 상세 (접힘/펼침) */}
      {status && status.queues.length > 0 && (
        <div className={cn('rounded-2xl border border-slate-200/50 overflow-hidden')}>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3',
              'bg-gradient-to-r from-slate-50 to-white',
              'hover:from-slate-100 hover:to-slate-50 transition-all'
            )}
          >
            <span className={cn('flex items-center gap-2 text-sm font-medium text-slate-600')}>
              <svg className={cn('w-4 h-4')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              계정별 상세
              <span className={cn('px-2 py-0.5 rounded-full bg-slate-200 text-xs')}>
                {status.queues.length}
              </span>
            </span>
            <svg
              className={cn('w-5 h-5 text-slate-400 transition-transform', isExpanded && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isExpanded && (
            <div className={cn('divide-y divide-slate-100')}>
              {status.queues.map((q) => {
                const hasJobs = q.waiting > 0 || q.active > 0 || q.delayed > 0;
                const queueTotal = q.waiting + q.active + q.delayed + q.completed + q.failed;
                const progress = queueTotal > 0 ? (q.completed / queueTotal) * 100 : 0;

                return (
                  <div
                    key={q.accountId}
                    className={cn(
                      'px-4 py-3 transition-all',
                      hasJobs ? 'bg-blue-50/30' : 'bg-white'
                    )}
                  >
                    <div className={cn('flex items-center justify-between mb-2')}>
                      <div className={cn('flex items-center gap-2')}>
                        {q.active > 0 && (
                          <span className={cn('relative flex h-2 w-2')}>
                            <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75')} />
                            <span className={cn('relative inline-flex rounded-full h-2 w-2 bg-blue-500')} />
                          </span>
                        )}
                        <span className={cn('font-medium text-sm text-slate-700')}>{q.accountId}</span>
                      </div>
                      <div className={cn('flex items-center gap-2')}>
                        <div className={cn('flex items-center gap-3 text-xs')}>
                          {q.waiting > 0 && (
                            <span className={cn('flex items-center gap-1 text-amber-600')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full bg-amber-400')} />
                              {q.waiting}
                            </span>
                          )}
                          {q.active > 0 && (
                            <span className={cn('flex items-center gap-1 text-blue-600 font-medium')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse')} />
                              {q.active}
                            </span>
                          )}
                          {q.delayed > 0 && (
                            <span className={cn('flex items-center gap-1 text-violet-600')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full bg-violet-400')} />
                              {q.delayed}
                            </span>
                          )}
                          {q.completed > 0 && (
                            <span className={cn('flex items-center gap-1 text-emerald-600')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full bg-emerald-400')} />
                              {q.completed}
                            </span>
                          )}
                          {q.failed > 0 && (
                            <span className={cn('flex items-center gap-1 text-rose-600')}>
                              <span className={cn('w-1.5 h-1.5 rounded-full bg-rose-400')} />
                              {q.failed}
                            </span>
                          )}
                        </div>
                        {hasJobs && (
                          <button
                            onClick={() => handleClearAccount(q.accountId)}
                            disabled={clearing === q.accountId}
                            className={cn(
                              'px-2 py-1 rounded-lg text-xs font-medium transition-all',
                              'bg-rose-100 text-rose-600',
                              'hover:bg-rose-200 disabled:opacity-50'
                            )}
                          >
                            {clearing === q.accountId ? '...' : '클리어'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 미니 진행률 */}
                    {queueTotal > 0 && (
                      <div className={cn('h-1 rounded-full bg-slate-200 overflow-hidden flex')}>
                        {q.completed > 0 && (
                          <div
                            className={cn('h-full bg-emerald-400')}
                            style={{ width: `${(q.completed / queueTotal) * 100}%` }}
                          />
                        )}
                        {q.active > 0 && (
                          <div
                            className={cn('h-full bg-blue-400 animate-pulse')}
                            style={{ width: `${(q.active / queueTotal) * 100}%` }}
                          />
                        )}
                        {q.delayed > 0 && (
                          <div
                            className={cn('h-full bg-violet-400')}
                            style={{ width: `${(q.delayed / queueTotal) * 100}%` }}
                          />
                        )}
                        {q.waiting > 0 && (
                          <div
                            className={cn('h-full bg-amber-400')}
                            style={{ width: `${(q.waiting / queueTotal) * 100}%` }}
                          />
                        )}
                        {q.failed > 0 && (
                          <div
                            className={cn('h-full bg-rose-400')}
                            style={{ width: `${(q.failed / queueTotal) * 100}%` }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Job 목록 테이블 */}
      {jobs.length > 0 && (
        <div className={cn('rounded-2xl border border-slate-200/50 overflow-hidden')}>
          <button
            onClick={() => setShowJobList(!showJobList)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3',
              'bg-gradient-to-r from-slate-50 to-white',
              'hover:from-slate-100 hover:to-slate-50 transition-all'
            )}
          >
            <span className={cn('flex items-center gap-2 text-sm font-medium text-slate-600')}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              작업 목록
              <span className={cn('px-2 py-0.5 rounded-full bg-slate-200 text-xs')}>
                {jobs.length}
              </span>
            </span>
            <svg
              className={cn('w-5 h-5 text-slate-400 transition-transform', showJobList && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showJobList && (
            <div className={cn('overflow-x-auto')}>
              <table className={cn('w-full text-xs')}>
                <thead className={cn('bg-slate-50 border-b border-slate-200')}>
                  <tr>
                    <th className={cn('px-3 py-2 text-left font-medium text-slate-500')}>상태</th>
                    <th className={cn('px-3 py-2 text-left font-medium text-slate-500')}>타입</th>
                    <th className={cn('px-3 py-2 text-left font-medium text-slate-500')}>계정</th>
                    <th className={cn('px-3 py-2 text-left font-medium text-slate-500')}>카페</th>
                    <th className={cn('px-3 py-2 text-left font-medium text-slate-500')}>내용</th>
                    <th className={cn('px-3 py-2 text-left font-medium text-slate-500')}>예정/시간</th>
                  </tr>
                </thead>
                <tbody className={cn('divide-y divide-slate-100')}>
                  {jobs.map((job) => (
                    <tr key={job.id} className={cn('hover:bg-slate-50/50')}>
                      <td className={cn('px-3 py-2')}>
                        <StatusBadge status={job.status} />
                      </td>
                      <td className={cn('px-3 py-2')}>
                        <TypeBadge type={job.type} />
                      </td>
                      <td className={cn('px-3 py-2 font-mono text-slate-600')}>{job.accountId}</td>
                      <td className={cn('px-3 py-2')}>
                        <span className={cn('text-slate-700')}>{job.cafeName || job.cafeId}</span>
                        {job.articleId && (
                          <span className={cn('ml-1 text-slate-400')}>#{job.articleId}</span>
                        )}
                      </td>
                      <td className={cn('px-3 py-2 max-w-[200px]')}>
                        <span className={cn('text-slate-600 truncate block')} title={job.content || job.subject || job.keyword || '-'}>
                          {job.content?.slice(0, 30) || job.subject?.slice(0, 30) || job.keyword || '-'}
                          {(job.content?.length || 0) > 30 && '...'}
                        </span>
                      </td>
                      <td className={cn('px-3 py-2 text-slate-500')}>
                        {job.delay ? formatDelay(job.delay) : job.finishedOn ? formatTime(job.finishedOn) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!status && !loading && (
        <div className={cn('text-center py-8')}>
          <svg className={cn('w-12 h-12 mx-auto text-slate-300 mb-3')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className={cn('text-sm text-slate-400')}>큐 상태를 불러오는 중...</p>
        </div>
      )}
    </div>
  );
};

// 통계 카드 컴포넌트
interface StatCardProps {
  label: string;
  value: number;
  color: 'amber' | 'blue' | 'violet' | 'emerald' | 'rose';
  icon: React.ReactNode;
  pulse?: boolean;
}

const colorMap = {
  amber: {
    bg: 'bg-gradient-to-br from-amber-50 to-amber-100',
    border: 'border-amber-200/50',
    text: 'text-amber-600',
    value: 'text-amber-700',
  },
  blue: {
    bg: 'bg-gradient-to-br from-blue-50 to-blue-100',
    border: 'border-blue-200/50',
    text: 'text-blue-600',
    value: 'text-blue-700',
  },
  violet: {
    bg: 'bg-gradient-to-br from-violet-50 to-violet-100',
    border: 'border-violet-200/50',
    text: 'text-violet-600',
    value: 'text-violet-700',
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100',
    border: 'border-emerald-200/50',
    text: 'text-emerald-600',
    value: 'text-emerald-700',
  },
  rose: {
    bg: 'bg-gradient-to-br from-rose-50 to-rose-100',
    border: 'border-rose-200/50',
    text: 'text-rose-600',
    value: 'text-rose-700',
  },
};

const StatCard = ({ label, value, color, icon, pulse }: StatCardProps) => {
  const colors = colorMap[color];

  return (
    <div className={cn(
      'relative p-3 rounded-xl border shadow-sm transition-all hover:shadow-md',
      colors.bg,
      colors.border
    )}>
      {pulse && (
        <span className={cn('absolute top-2 right-2 flex h-2 w-2')}>
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', `bg-${color}-400`)} />
          <span className={cn('relative inline-flex rounded-full h-2 w-2', `bg-${color}-500`)} />
        </span>
      )}
      <div className={cn('flex items-center gap-1.5 mb-1', colors.text)}>
        {icon}
        <span className={cn('text-xs font-medium')}>{label}</span>
      </div>
      <p className={cn('text-2xl font-bold', colors.value)}>{value}</p>
    </div>
  );
};

// 상태 뱃지
const StatusBadge = ({ status }: { status: JobDetail['status'] }) => {
  const styles: Record<JobDetail['status'], string> = {
    delayed: 'bg-violet-100 text-violet-700',
    waiting: 'bg-amber-100 text-amber-700',
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-rose-100 text-rose-700',
  };
  const labels: Record<JobDetail['status'], string> = {
    delayed: '예약',
    waiting: '대기',
    active: '진행',
    completed: '완료',
    failed: '실패',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', styles[status])}>
      {labels[status]}
    </span>
  );
};

// 타입 뱃지
const TypeBadge = ({ type }: { type: 'post' | 'comment' | 'reply' }) => {
  const styles: Record<string, string> = {
    post: 'bg-indigo-100 text-indigo-700',
    comment: 'bg-cyan-100 text-cyan-700',
    reply: 'bg-pink-100 text-pink-700',
  };
  const labels: Record<string, string> = {
    post: '글',
    comment: '댓글',
    reply: '대댓글',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', styles[type])}>
      {labels[type]}
    </span>
  );
};

// 딜레이 포맷
const formatDelay = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}시간 ${minutes % 60}분 후`;
  }
  if (minutes > 0) {
    return `${minutes}분 후`;
  }
  return `${seconds}초 후`;
};

// 시간 포맷
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
