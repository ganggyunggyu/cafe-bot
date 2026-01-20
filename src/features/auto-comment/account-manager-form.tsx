import { cn } from '@/shared/lib/cn';

type AccountField = 'id' | 'password' | 'nickname';

interface AccountManagerFormProps {
  id: string;
  password: string;
  nickname: string;
  isPending: boolean;
  onFieldChange: (field: AccountField, value: string) => void;
  onSubmit: () => void;
}

export const AccountManagerForm = ({
  id,
  password,
  nickname,
  isPending,
  onFieldChange,
  onSubmit,
}: AccountManagerFormProps) => {
  const sectionClassName = cn(
    'rounded-2xl border border-(--border) bg-white/70 p-4 shadow-sm'
  );
  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-white/80 px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
  );
  const primaryButtonClassName = cn(
    'rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(216,92,47,0.35)] transition',
    'bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );

  return (
    <div className={sectionClassName}>
      <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
        새 계정 추가
      </h3>
      <div className={cn('flex flex-col gap-2')}>
        <input
          type="text"
          placeholder="네이버 ID"
          value={id}
          onChange={(e) => onFieldChange('id', e.target.value)}
          className={inputClassName}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => onFieldChange('password', e.target.value)}
          className={inputClassName}
        />
        <input
          type="text"
          placeholder="닉네임 (선택)"
          value={nickname}
          onChange={(e) => onFieldChange('nickname', e.target.value)}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={isPending}
          className={primaryButtonClassName}
        >
          {isPending ? '처리 중...' : '추가'}
        </button>
      </div>
    </div>
  );
};
