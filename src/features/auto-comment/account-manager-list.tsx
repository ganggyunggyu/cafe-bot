import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import type { NaverAccount } from '@/shared/lib/account-manager';

interface AccountManagerListProps {
  accounts: NaverAccount[];
  isPending: boolean;
  onLogin: (account: NaverAccount) => void;
  onSetMain: (id: string) => void;
  onRemove: (id: string) => void;
}

export const AccountManagerList = ({
  accounts,
  isPending,
  onLogin,
  onSetMain,
  onRemove,
}: AccountManagerListProps) => {
  return (
    <div>
      <h3 className={cn('text-sm font-semibold text-(--ink) mb-3')}>
        등록된 계정 ({accounts.length}개)
      </h3>
      {accounts.length === 0 ? (
        <p className={cn('text-sm text-(--ink-muted)')}>등록된 계정이 없습니다.</p>
      ) : (
        <ul className={cn('space-y-2')}>
          {accounts.map((account) => (
            <li
              key={account.id}
              className={cn(
                'rounded-2xl border border-(--border) bg-(--surface-muted) px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3',
                account.isMain &&
                  'border-(--accent) bg-(--accent-soft)'
              )}
            >
              <div className={cn('flex flex-wrap items-center gap-2')}>
                <span className={cn('text-sm font-semibold text-(--ink)')}>
                  {account.id}
                </span>
                {account.nickname ? (
                  <span className={cn('text-xs text-(--ink-muted)')}>
                    ({account.nickname})
                  </span>
                ) : null}
                {account.isMain ? (
                  <span
                    className={cn(
                      'rounded-full bg-(--accent) px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--background)'
                    )}
                  >
                    메인
                  </span>
                ) : null}
              </div>
              <div className={cn('flex flex-wrap gap-2')}>
                <Button
                  variant="teal"
                  size="xs"
                  onClick={() => onLogin(account)}
                  disabled={isPending}
                >
                  로그인
                </Button>
                {!account.isMain ? (
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => onSetMain(account.id)}
                    disabled={isPending}
                  >
                    메인 설정
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  size="xs"
                  onClick={() => onRemove(account.id)}
                  disabled={isPending}
                >
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
