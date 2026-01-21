import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

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

export const AutoPostForm = ({
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
}: AutoPostFormProps) => {
  const sectionClassName = cn(
    'rounded-2xl border border-(--border) bg-(--surface-muted) p-4 shadow-sm'
  );
  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );
  const { service, keyword, ref } = postInput;

  return (
    <div className={cn('space-y-6')}>
      <div className={cn('space-y-2')}>
        <p
          className={cn(
            'text-xs uppercase tracking-[0.3em] text-(--ink-muted)'
          )}
        >
          Auto Posting
        </p>
        <h2 className={cn('font-(--font-display) text-xl text-(--ink)')}>
          자동 포스팅
        </h2>
      </div>

      <div className={cn('flex flex-wrap gap-2')}>
        <Button
          variant={mode === 'new' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onModeChange('new')}
        >
          새 글 + 댓글
        </Button>
        <Button
          variant={mode === 'existing' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => onModeChange('existing')}
        >
          기존 글에 댓글만
        </Button>
      </div>

      {mode === 'new' ? (
        <div className={sectionClassName}>
          <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
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
          <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
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
          <h3 className={cn('text-sm font-semibold text-(--ink)')}>
            댓글 목록 (계정 순서대로 작성됨)
          </h3>
          <Button variant="teal" size="xs" onClick={onAddComment}>
            + 댓글 추가
          </Button>
        </div>
        <div className={cn('space-y-2')}>
          {comments.map((comment, index) => (
            <div key={index} className={cn('flex flex-col gap-2 sm:flex-row')}>
              <span className={cn('py-2 text-xs text-(--ink-muted) w-8')}>
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
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() => onRemoveComment(index)}
                >
                  삭제
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isPending}
        onClick={onSubmit}
      >
        {mode === 'new' ? '글 작성 + 댓글 달기' : '댓글 달기'}
      </Button>

      {result ? (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm',
            result.type === 'success'
              ? 'border-(--success) bg-(--success-soft) text-(--success)'
              : 'border-(--danger) bg-(--danger-soft) text-(--danger)'
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
};
