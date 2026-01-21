'use client';

import { useState, useEffect, useTransition, use } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select, Button, PageLayout } from '@/shared/ui';
import Link from 'next/link';
import {
  getDetailedJobs,
  type JobDetail,
  type JobsPage,
  type JobsFilter,
} from '@/entities/queue';
import { getAccountInfoAction, type AccountInfo } from './actions';

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
  delayed: 'bg-info-soft text-info',
  waiting: 'bg-surface-muted text-ink-muted',
  active: 'bg-warning-soft text-warning',
  completed: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
};

const TYPE_COLORS: Record<string, string> = {
  post: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  comment: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  reply: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
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

const workerIdToAccountId = (workerId: string): string => {
  return workerId.replace(/^task_/, '');
};

interface Props {
  params: Promise<{ workerId: string }>;
}

export default function WorkerQueuePage({ params }: Props) {
  const { workerId } = use(params);
  const accountId = workerIdToAccountId(workerId);

  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [jobsData, setJobsData] = useState<JobsPage | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [filter, setFilter] = useState<JobsFilter>({ status: 'all', type: 'all', accountId });
  const [isPolling, setIsPolling] = useState(true);

  const loadData = async () => {
    const [jobsResult, accountResult] = await Promise.all([
      getDetailedJobs({ ...filter, accountId }, page, pageSize),
      getAccountInfoAction(accountId),
    ]);
    setJobsData(jobsResult);
    setAccountInfo(accountResult);
  };

  useEffect(() => {
    loadData();

    if (!isPolling) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [filter, page, isPolling, accountId]);

  const handleFilterChange = (key: keyof JobsFilter, value: string) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const statusCounts = jobsData?.jobs.reduce(
    (acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) || {};

  return (
    <PageLayout
      title={`${accountInfo?.nickname || accountId} 큐`}
      subtitle={`Worker: ${workerId}`}
    >
      <div className={cn('space-y-6')}>
        {/* 뒤로가기 */}
        <Link
          href="/queue"
          className={cn('inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink')}
        >
          ← 전체 큐 대시보드
        </Link>

        {/* 계정 정보 카드 */}
        {accountInfo && (
          <div className={cn('rounded-2xl border border-border-light bg-surface p-6')}>
            <div className={cn('flex items-start justify-between')}>
              <div>
                <h2 className={cn('text-xl font-bold text-ink')}>
                  {accountInfo.nickname || accountId}
                </h2>
                <p className={cn('text-sm text-ink-muted mt-1')}>
                  계정 ID: {accountId}
                </p>
              </div>
              <div className={cn('flex items-center gap-2')}>
                <Button
                  variant={isPolling ? 'teal' : 'ghost'}
                  size="sm"
                  onClick={() => setIsPolling((p) => !p)}
                >
                  {isPolling ? '자동 새로고침' : '새로고침 중지'}
                </Button>
              </div>
            </div>

            <div className={cn('grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6')}>
              <div className={cn('rounded-xl bg-surface-muted p-4')}>
                <div className={cn('text-xs text-ink-muted mb-1')}>역할</div>
                <div className={cn('font-semibold text-ink')}>
                  {accountInfo.isMain ? '메인 계정' : '댓글 계정'}
                </div>
              </div>
              <div className={cn('rounded-xl bg-surface-muted p-4')}>
                <div className={cn('text-xs text-ink-muted mb-1')}>페르소나</div>
                <div className={cn('font-semibold text-ink')}>
                  {accountInfo.personaId || '없음'}
                </div>
              </div>
              <div className={cn('rounded-xl bg-surface-muted p-4')}>
                <div className={cn('text-xs text-ink-muted mb-1')}>일일 제한</div>
                <div className={cn('font-semibold text-ink')}>
                  {accountInfo.dailyPostLimit || '무제한'}
                </div>
              </div>
              <div className={cn('rounded-xl bg-surface-muted p-4')}>
                <div className={cn('text-xs text-ink-muted mb-1')}>활동 시간</div>
                <div className={cn('font-semibold text-ink text-sm')}>
                  {accountInfo.activityHours
                    ? `${accountInfo.activityHours.start}시~${accountInfo.activityHours.end}시`
                    : '제한 없음'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 작업 현황 요약 */}
        <div className={cn('rounded-2xl border border-border-light bg-surface p-6')}>
          <h3 className={cn('text-sm font-medium text-ink-muted mb-4')}>작업 현황</h3>
          <div className={cn('flex flex-wrap gap-3')}>
            {(['delayed', 'waiting', 'active', 'completed', 'failed'] as const).map((status) => (
              <div
                key={status}
                className={cn(
                  'px-4 py-2 rounded-xl',
                  STATUS_COLORS[status]
                )}
              >
                <span className={cn('font-semibold')}>{statusCounts[status] || 0}</span>
                <span className={cn('ml-1.5 text-sm opacity-80')}>{STATUS_LABELS[status]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 필터 */}
        <div className={cn('rounded-2xl border border-border-light bg-surface p-4 flex flex-wrap gap-4 items-center')}>
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
            <div className={cn('ml-auto text-sm text-ink-muted')}>
              총 {jobsData.total}건
            </div>
          )}
        </div>

        {/* Jobs 테이블 */}
        <div className={cn('rounded-2xl border border-border-light bg-surface overflow-hidden')}>
          <div className={cn('overflow-x-auto')}>
            <table className={cn('w-full text-sm')}>
              <thead>
                <tr className={cn('border-b border-border-light bg-surface-muted')}>
                  <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>상태</th>
                  <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>타입</th>
                  <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>카페</th>
                  <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>내용</th>
                  <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>예정/시간</th>
                </tr>
              </thead>
              <tbody>
                {jobsData?.jobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
                {(!jobsData || jobsData.jobs.length === 0) && (
                  <tr>
                    <td colSpan={5} className={cn('px-5 py-12 text-center text-ink-muted')}>
                      {isPending ? '로딩 중...' : '작업이 없습니다'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {jobsData && jobsData.totalPages > 1 && (
            <div className={cn('flex items-center justify-between border-t border-border-light px-5 py-4')}>
              <div className={cn('text-sm text-ink-muted')}>
                {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, jobsData.total)} / {jobsData.total}
              </div>
              <div className={cn('flex gap-1')}>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  ««
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  «
                </Button>
                {Array.from({ length: Math.min(5, jobsData.totalPages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(page - 2, jobsData.totalPages - 4)) + i;
                  if (pageNum > jobsData.totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? 'primary' : 'ghost'}
                      size="xs"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage((p) => Math.min(jobsData.totalPages, p + 1))}
                  disabled={page === jobsData.totalPages}
                >
                  »
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage(jobsData.totalPages)}
                  disabled={page === jobsData.totalPages}
                >
                  »»
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

const JobRow = ({ job }: { job: JobDetail }) => {
  const getContentDisplay = () => {
    if (job.type === 'post') {
      return (
        <div>
          <div className={cn('font-medium text-ink truncate max-w-[200px]')}>
            {job.subject || job.keyword || '-'}
          </div>
          {job.keyword && job.subject && (
            <div className={cn('text-xs text-ink-muted')}>키워드: {job.keyword}</div>
          )}
        </div>
      );
    }
    return (
      <div>
        <div className={cn('text-ink truncate max-w-[200px]')} title={job.content}>
          {job.content || '-'}
        </div>
        <div className={cn('text-xs text-ink-muted')}>
          #{job.articleId}
          {job.type === 'reply' && ` (댓글 ${job.commentIndex})`}
        </div>
      </div>
    );
  };

  const getTimeDisplay = () => {
    if (job.status === 'delayed' && job.delay) {
      return (
        <div className={cn('text-info font-medium')}>
          {formatDelay(job.delay)} 후
        </div>
      );
    }
    if (job.status === 'active') {
      return <div className={cn('text-warning')}>처리중...</div>;
    }
    if (job.finishedOn) {
      return <div className={cn('text-ink-muted')}>{formatTime(job.finishedOn)}</div>;
    }
    return <div className={cn('text-ink-muted')}>{formatTime(job.createdAt)}</div>;
  };

  return (
    <tr className={cn('border-b border-border-light hover:bg-surface-muted transition-all')}>
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
      <td className={cn('px-5 py-4 text-ink')}>
        <span className={cn('truncate max-w-[120px] block')} title={job.cafeName}>
          {job.cafeName || job.cafeId}
        </span>
      </td>
      <td className={cn('px-5 py-4')}>{getContentDisplay()}</td>
      <td className={cn('px-5 py-4')}>{getTimeDisplay()}</td>
    </tr>
  );
};
