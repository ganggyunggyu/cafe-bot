'use client';

import { useState, useEffect, useTransition } from 'react';
import { cn } from '@/shared/lib/cn';
import { Select, Button, ConfirmModal } from '@/shared/ui';
import {
  getDetailedJobs,
  getQueueSummary,
  clearAllQueues,
  removeJob,
  getRelatedJobs,
  type JobDetail,
  type JobsPage,
  type JobsFilter,
  type QueueSummary,
} from '@/entities/queue';
import { getAccountsAction, getCafesAction, type AccountData, type CafeData } from '@/features/accounts/actions';

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
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `어제 ${time}`;
  if (diffDays <= 7) return `${diffDays}일전 ${time}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
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
  const [showClearModal, setShowClearModal] = useState(false);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [cafes, setCafes] = useState<CafeData[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState<{ accountId: string; jobId: string; content: string } | null>(null);
  const [relatedJobs, setRelatedJobs] = useState<{ articleId: number; jobs: JobDetail[] } | null>(null);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const loadData = async () => {
    const [jobsResult, summaryResult, accountsData, cafesData] = await Promise.all([
      getDetailedJobs(filter, page, pageSize),
      getQueueSummary(),
      getAccountsAction(),
      getCafesAction(),
    ]);
    setJobsData(jobsResult);
    setSummary(summaryResult);
    setAccounts(accountsData);
    setCafes(cafesData);
  };

  const handleDeleteJob = async () => {
    if (!showDeleteModal) return;
    startTransition(async () => {
      await removeJob(showDeleteModal.accountId, showDeleteModal.jobId);
      setShowDeleteModal(null);
      loadData();
    });
  };

  const handleViewRelated = async (articleId: number) => {
    setIsLoadingRelated(true);
    const jobs = await getRelatedJobs(articleId);
    setRelatedJobs({ articleId, jobs });
    setIsLoadingRelated(false);
  };

  useEffect(() => {
    loadData();

    if (!isPolling) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [filter, page, isPolling]);

  const handleClearAll = () => {
    startTransition(async () => {
      await clearAllQueues();
      setShowClearModal(false);
      loadData();
    });
  };

  const handleFilterChange = (key: keyof JobsFilter, value: string) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const selectClassName = cn(
    'rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink',
    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10'
  );

  const totalPending = summary
    ? summary.total.delayed + summary.total.waiting + summary.total.active
    : 0;

  const filteredJobs = (jobsData?.jobs || []).filter((job) => {
    if (!searchKeyword.trim()) return true;
    const keyword = searchKeyword.toLowerCase();
    return (
      job.keyword?.toLowerCase().includes(keyword) ||
      job.subject?.toLowerCase().includes(keyword) ||
      job.content?.toLowerCase().includes(keyword) ||
      job.accountId.toLowerCase().includes(keyword) ||
      job.cafeName?.toLowerCase().includes(keyword)
    );
  });

  return (
    <div className={cn('space-y-6')}>
      {/* 전체 클리어 확인 모달 */}
      <ConfirmModal
        isOpen={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={handleClearAll}
        title="모든 큐를 클리어하시겠습니까?"
        description={`대기 중인 작업 ${totalPending}건이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
        variant="danger"
        confirmText="전체 클리어"
        cancelText="취소"
        isLoading={isPending}
      />

      {/* 개별 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        onConfirm={handleDeleteJob}
        title="이 작업을 삭제하시겠습니까?"
        description={showDeleteModal ? `"${showDeleteModal.content}" 작업이 삭제됩니다.` : ''}
        variant="danger"
        confirmText="삭제"
        cancelText="취소"
        isLoading={isPending}
      />

      {/* 연관 작업 모달 */}
      {relatedJobs && (
        <div
          className={cn('fixed inset-0 z-50 flex items-center justify-center bg-black/50')}
          onClick={() => setRelatedJobs(null)}
        >
          <div
            className={cn('bg-surface rounded-2xl border border-border-light w-full max-w-2xl max-h-[80vh] overflow-hidden')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn('flex items-center justify-between p-4 border-b border-border-light')}>
              <div>
                <h3 className={cn('font-semibold text-ink')}>연관 작업</h3>
                <p className={cn('text-sm text-ink-muted')}>글 #{relatedJobs.articleId}의 댓글/대댓글</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRelatedJobs(null)}>닫기</Button>
            </div>
            <div className={cn('p-4 overflow-y-auto max-h-96')}>
              {relatedJobs.jobs.length === 0 ? (
                <p className={cn('text-center text-ink-muted py-8')}>연관된 댓글/대댓글이 없습니다</p>
              ) : (
                <div className={cn('space-y-2')}>
                  {relatedJobs.jobs.map((job) => (
                    <div
                      key={job.id}
                      className={cn('p-3 rounded-lg border border-border-light bg-surface-muted')}
                    >
                      <div className={cn('flex items-center gap-2 mb-2')}>
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', STATUS_COLORS[job.status])}>
                          {STATUS_LABELS[job.status]}
                        </span>
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', TYPE_COLORS[job.type])}>
                          {TYPE_LABELS[job.type]}
                        </span>
                        <span className={cn('text-xs text-ink-muted')}>{job.accountId}</span>
                      </div>
                      <p className={cn('text-sm text-ink truncate')}>{job.content || '-'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className={cn('flex items-center justify-between')}>
        <div>
          <h2 className={cn('text-xl font-bold text-ink')}>큐 대시보드</h2>
          <p className={cn('text-sm text-ink-muted mt-1')}>작업 상세 모니터링</p>
        </div>
        <div className={cn('flex items-center gap-2')}>
          <Button
            variant={isPolling ? 'teal' : 'ghost'}
            size="sm"
            onClick={() => setIsPolling((p) => !p)}
          >
            {isPolling ? '자동 새로고침' : '새로고침 중지'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowClearModal(true)}
            disabled={isPending}
          >
            전체 클리어
          </Button>
          {onClose && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              닫기
            </Button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      {summary && (
        <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4')}>
          <div className={cn('rounded-2xl border border-border-light bg-surface p-5')}>
            <h3 className={cn('text-sm font-medium text-ink-muted mb-4')}>전체 상태</h3>
            <div className={cn('grid grid-cols-5 gap-2')}>
              {(['failed', 'active', 'delayed', 'waiting', 'completed'] as const).map((status) => (
                <div key={status} className={cn('text-center')}>
                  <div className={cn('text-xl font-bold text-ink')}>
                    {summary.total[status]}
                  </div>
                  <div className={cn('text-xs text-ink-muted')}>{STATUS_LABELS[status]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={cn('rounded-2xl border border-border-light bg-surface p-5')}>
            <h3 className={cn('text-sm font-medium text-ink-muted mb-4')}>타입별 (대기중)</h3>
            <div className={cn('flex gap-4')}>
              {(['post', 'comment', 'reply'] as const).map((type) => {
                const pending =
                  summary.byType[type].delayed +
                  summary.byType[type].waiting +
                  summary.byType[type].active;
                return (
                  <div key={type} className={cn('flex-1 text-center')}>
                    <div className={cn('text-xl font-bold text-ink')}>{pending}</div>
                    <div className={cn('text-xs text-ink-muted')}>{TYPE_LABELS[type]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={cn('rounded-2xl border border-border-light bg-surface p-5')}>
            <h3 className={cn('text-sm font-medium text-ink-muted mb-4')}>카페별 (대기중)</h3>
            <div className={cn('space-y-2')}>
              {summary.byCafe.slice(0, 3).map((cafe) => (
                <div key={cafe.cafeId} className={cn('flex justify-between text-sm')}>
                  <span className={cn('text-ink truncate flex-1')}>{cafe.cafeName}</span>
                  <span className={cn('font-semibold text-ink')}>{cafe.count}</span>
                </div>
              ))}
              {summary.byCafe.length === 0 && (
                <p className={cn('text-sm text-ink-muted')}>대기 중인 작업 없음</p>
              )}
            </div>
          </div>

          <div className={cn('rounded-2xl border border-border-light bg-surface p-5')}>
            <h3 className={cn('text-sm font-medium text-ink-muted mb-4')}>계정별 (대기중)</h3>
            <div className={cn('space-y-2')}>
              {summary.byAccount.slice(0, 3).map((acc) => (
                <a
                  key={acc.accountId}
                  href={`http://localhost:3008/queue/task_${acc.accountId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn('flex justify-between text-sm hover:bg-surface-muted rounded-lg px-2 py-1 -mx-2 transition-colors')}
                >
                  <span className={cn('text-ink truncate flex-1')}>{acc.accountId}</span>
                  <span className={cn('font-semibold text-ink')}>{acc.count}</span>
                </a>
              ))}
              {summary.byAccount.length === 0 && (
                <p className={cn('text-sm text-ink-muted')}>대기 중인 작업 없음</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className={cn('rounded-2xl border border-border-light bg-surface p-4 space-y-3')}>
        <div className={cn('flex flex-wrap gap-4 items-center')}>
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

          <Select
            label="카페"
            value={filter.cafeId || 'all'}
            onChange={(e) => handleFilterChange('cafeId', e.target.value === 'all' ? '' : e.target.value)}
            options={[
              { value: 'all', label: '전체 카페' },
              ...cafes.map((c) => ({ value: c.cafeId, label: c.name })),
            ]}
            fullWidth={false}
            className="w-36"
          />

          <Select
            label="계정"
            value={filter.accountId || 'all'}
            onChange={(e) => handleFilterChange('accountId', e.target.value === 'all' ? '' : e.target.value)}
            options={[
              { value: 'all', label: '전체 계정' },
              ...accounts.map((a) => ({ value: a.id, label: a.id })),
            ]}
            fullWidth={false}
            className="w-36"
          />

          {jobsData && (
            <div className={cn('ml-auto text-sm text-ink-muted')}>
              총 {jobsData.total}건
            </div>
          )}
        </div>

        <div className={cn('flex gap-2')}>
          <input
            type="text"
            placeholder="키워드, 제목, 내용 검색..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className={cn(
              'flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink',
              'placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10'
            )}
          />
          {searchKeyword && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchKeyword('')}
            >
              초기화
            </Button>
          )}
        </div>
      </div>

      {/* Jobs 테이블 */}
      <div className={cn('rounded-2xl border border-border-light bg-surface overflow-hidden')}>
        <div className={cn('overflow-x-auto')}>
          <table className={cn('w-full text-sm')}>
            <thead>
              <tr className={cn('border-b border-border-light bg-surface-muted')}>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>상태</th>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>타입</th>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>계정</th>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>카페</th>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>내용</th>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>예정/시간</th>
                <th className={cn('px-5 py-4 text-left font-medium text-ink-muted')}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  onDelete={(content) => setShowDeleteModal({ accountId: job.accountId, jobId: job.id, content })}
                  onViewRelated={job.type === 'post' && job.articleId ? () => handleViewRelated(job.articleId!) : undefined}
                  isLoadingRelated={isLoadingRelated}
                />
              ))}
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={7} className={cn('px-5 py-12 text-center text-ink-muted')}>
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
  );
};

interface JobRowProps {
  job: JobDetail;
  onDelete: (content: string) => void;
  onViewRelated?: () => void;
  isLoadingRelated: boolean;
}

const JobRow = ({ job, onDelete, onViewRelated, isLoadingRelated }: JobRowProps) => {
  const getContentDisplay = () => {
    if (job.type === 'post') {
      return (
        <div>
          <div className={cn('font-medium text-ink truncate max-w-50')}>
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
        <div className={cn('text-ink truncate max-w-50')} title={job.content}>
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

  const contentForDelete = job.type === 'post'
    ? (job.subject || job.keyword || '글 작업')
    : (job.content?.slice(0, 30) || '댓글 작업');

  const canDelete = job.status !== 'active';

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
      <td className={cn('px-5 py-4')}>
        <a
          href={`http://localhost:3008/queue/task_${job.accountId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('text-ink hover:text-accent underline-offset-2 hover:underline transition-colors')}
        >
          {job.accountId}
        </a>
      </td>
      <td className={cn('px-5 py-4 text-ink')}>
        <span className={cn('truncate max-w-30 block')} title={job.cafeName}>
          {job.cafeName || job.cafeId}
        </span>
      </td>
      <td className={cn('px-5 py-4')}>{getContentDisplay()}</td>
      <td className={cn('px-5 py-4')}>{getTimeDisplay()}</td>
      <td className={cn('px-5 py-4')}>
        <div className={cn('flex gap-1')}>
          {onViewRelated && (
            <button
              onClick={onViewRelated}
              disabled={isLoadingRelated}
              className={cn(
                'px-2 py-1 rounded text-xs font-medium transition-colors',
                'bg-accent/10 text-accent hover:bg-accent/20',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="연관 댓글/대댓글 보기"
            >
              연관
            </button>
          )}
          <button
            onClick={() => onDelete(contentForDelete)}
            disabled={!canDelete}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              'bg-danger-soft text-danger hover:bg-danger/20',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title={canDelete ? '삭제' : '진행 중인 작업은 삭제할 수 없습니다'}
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
};
