import { cn } from '@/shared/lib/cn';

export type AutoPostMode = 'new' | 'existing';

export interface AutoPostInputState {
  service: string;
  keyword: string;
  ref: string;
}

export interface AutoPostResultState {
  type: 'success' | 'error';
  message: string;
  details?: string[];
}

interface AutoPostFormProps {
  mode: AutoPostMode;
  postInput: AutoPostInputState;
  articleId: string;
  comments: string[];
  result: AutoPostResultState | null;
  isPending: boolean;
  onModeChange: (mode: AutoPostMode) => void;
  onPostInputChange: (next: AutoPostInputState) => void;
  onArticleIdChange: (value: string) => void;
  onAddComment: () => void;
  onRemoveComment: (index: number) => void;
  onUpdateComment: (index: number, value: string) => void;
  onSubmit: () => void;
}

export function AutoPostForm({
  mode,
  postInput,
  articleId,
  comments,
  result,
  isPending,
  onModeChange,
  onPostInputChange,
  onArticleIdChange,
  onAddComment,
  onRemoveComment,
  onUpdateComment,
  onSubmit,
}: AutoPostFormProps) {
  const sectionClassName = cn(
    'rounded-2xl border border-[color:var(--border)] bg-white/70 p-4 shadow-sm'
  );
  const inputClassName = cn(
    'w-full rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] shadow-sm transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]'
  );
  const tabClassName = (active: boolean) =>
    cn(
      'rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition',
      active
        ? 'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_12px_30px_rgba(216,92,47,0.35)]'
        : 'border border-[color:var(--border)] bg-white/70 text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]'
    );
  const addButtonClassName = cn(
    'rounded-full px-3 py-1 text-xs sm:text-sm font-semibold text-white shadow-[0_10px_24px_rgba(31,111,103,0.35)] transition',
    'bg-[var(--teal)] hover:brightness-105'
  );
  const deleteButtonClassName = cn(
    'rounded-full px-3 py-1 text-xs sm:text-sm font-semibold text-white shadow-[0_10px_24px_rgba(181,65,50,0.35)] transition',
    'bg-[var(--danger)] hover:brightness-105'
  );
  const submitButtonClassName = cn(
    'w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(216,92,47,0.35)] transition',
    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );
  const { service, keyword, ref } = postInput;

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.3em] text-[color:var(--ink-muted)]'
          )}
        >
          Auto Posting
        </p>
        <h2 className={cn('font-[var(--font-display)] text-xl text-[color:var(--ink)]')}>
          자동 포스팅
        </h2>
      </div>

      <div className={cn('flex flex-wrap gap-2')}>
        <button
          type="button"
          onClick={() => onModeChange('new')}
          className={tabClassName(mode === 'new')}
        >
          새 글 + 댓글
        </button>
        <button
          type="button"
          onClick={() => onModeChange('existing')}
          className={tabClassName(mode === 'existing')}
        >
          기존 글에 댓글만
        </button>
      </div>

      {mode === 'new' ? (
        <div className={sectionClassName}>
          <h3 className={cn('text-sm font-semibold text-[color:var(--ink)] mb-3')}>
            글 작성 정보
          </h3>
          <div className={cn('flex flex-col gap-2')}>
            <input
              type="text"
              placeholder="service (예: 여행)"
              value={service}
              onChange={(e) =>
                onPostInputChange({
                  ...postInput,
                  service: e.target.value,
                })
              }
              className={inputClassName}
            />
            <input
              type="text"
              placeholder="keyword (예: 제주도 맛집)"
              value={keyword}
              onChange={(e) =>
                onPostInputChange({
                  ...postInput,
                  keyword: e.target.value,
                })
              }
              className={inputClassName}
            />
            <input
              type="text"
              placeholder="ref (선택, 참고 URL)"
              value={ref}
              onChange={(e) =>
                onPostInputChange({
                  ...postInput,
                  ref: e.target.value,
                })
              }
              className={inputClassName}
            />
          </div>
        </div>
      ) : (
        <div className={sectionClassName}>
          <h3 className={cn('text-sm font-semibold text-[color:var(--ink)] mb-3')}>
            게시글 ID
          </h3>
          <input
            type="text"
            placeholder="articleId (예: 123)"
            value={articleId}
            onChange={(e) => onArticleIdChange(e.target.value)}
            className={inputClassName}
          />
        </div>
      )}

      <div className={sectionClassName}>
        <div className={cn('flex flex-wrap justify-between items-center gap-3 mb-3')}>
          <h3 className={cn('text-sm font-semibold text-[color:var(--ink)]')}>
            댓글 목록 (계정 순서대로 작성됨)
          </h3>
          <button
            type="button"
            onClick={onAddComment}
            className={addButtonClassName}
          >
            + 댓글 추가
          </button>
        </div>
        <div className={cn('space-y-2')}>
          {comments.map((comment, index) => (
            <div key={index} className={cn('flex flex-col gap-2 sm:flex-row')}>
              <span className={cn('py-2 text-xs text-[color:var(--ink-muted)] w-8')}>
                {index + 1}.
              </span>
              <textarea
                placeholder={`댓글 ${index + 1} 내용`}
                value={comment}
                onChange={(e) => onUpdateComment(index, e.target.value)}
                className={cn(inputClassName, 'flex-1 min-h-[70px] resize-none')}
                rows={2}
              />
              {comments.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoveComment(index)}
                  className={deleteButtonClassName}
                >
                  삭제
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending}
        className={submitButtonClassName}
      >
        {isPending ? '처리 중...' : mode === 'new' ? '글 작성 + 댓글 달기' : '댓글 달기'}
      </button>

      {result ? (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm',
            result.type === 'success'
              ? 'border-[color:var(--success)] bg-[color:var(--success-soft)] text-[color:var(--success)]'
              : 'border-[color:var(--danger)] bg-[color:var(--danger-soft)] text-[color:var(--danger)]'
          )}
        >
          <p className={cn('font-semibold')}>{result.message}</p>
          {result.details ? (
            <ul className={cn('mt-2 space-y-1 text-xs')}>
              {result.details.map((detail, index) => (
                <li key={index}>• {detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
