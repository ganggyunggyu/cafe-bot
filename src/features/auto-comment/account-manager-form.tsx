import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

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
    'rounded-2xl border border-(--border) bg-(--surface-muted) p-4 shadow-sm'
  );
  const inputClassName = cn(
    'w-full rounded-xl border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--ink) placeholder:text-(--ink-muted) shadow-sm transition focus:border-(--accent) focus:outline-none focus:ring-2 focus:ring-(--accent)'
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
        <Button
          variant="primary"
          size="md"
          fullWidth
          isLoading={isPending}
          onClick={onSubmit}
        >
          추가
        </Button>
      </div>
    </div>
  );
};
