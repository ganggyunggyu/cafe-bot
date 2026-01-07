import { cn } from '@/shared/lib/cn';
import type { NaverAccount } from '@/shared/lib/account-manager';

interface AccountManagerListProps {
  accounts: NaverAccount[];
  isPending: boolean;
  onLogin: (account: NaverAccount) => void;
  onSetMain: (id: string) => void;
  onRemove: (id: string) => void;
}

export function AccountManagerList({
  accounts,
  isPending,
  onLogin,
  onSetMain,
  onRemove,
}: AccountManagerListProps) {
  const secondaryButtonClassName = cn(
    'rounded-full px-3 py-1 text-xs sm:text-sm font-semibold text-white shadow-[0_10px_24px_rgba(31,111,103,0.35)] transition',
    'bg-[var(--teal)] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );
  const ghostButtonClassName = cn(
    'rounded-full border border-[color:var(--border)] bg-white/70 px-3 py-1 text-xs sm:text-sm font-semibold text-[color:var(--ink)] transition hover:bg-white',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );
  const dangerButtonClassName = cn(
    'rounded-full px-3 py-1 text-xs sm:text-sm font-semibold text-white shadow-[0_10px_24px_rgba(181,65,50,0.35)] transition',
    'bg-[var(--danger)] hover:brightness-105',
    'disabled:cursor-not-allowed disabled:opacity-60'
  );

  return (
    <div>
      <h3 className={cn('text-sm font-semibold text-[color:var(--ink)] mb-3')}>
        등록된 계정 ({accounts.length}개)
      </h3>
      {accounts.length === 0 ? (
        <p className={cn('text-sm text-[color:var(--ink-muted)]')}>등록된 계정이 없어.</p>
      ) : (
        <ul className={cn('space-y-2')}>
          {accounts.map((account) => (
            <li
              key={account.id}
              className={cn(
                'rounded-2xl border border-[color:var(--border)] bg-white/70 px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3',
                account.isMain &&
                  'border-[color:var(--accent)] bg-[color:var(--accent-soft)]/70'
              )}
            >
              <div className={cn('flex flex-wrap items-center gap-2')}>
                <span className={cn('text-sm font-semibold text-[color:var(--ink)]')}>
                  {account.id}
                </span>
                {account.nickname ? (
                  <span className={cn('text-xs text-[color:var(--ink-muted)]')}>
                    ({account.nickname})
                  </span>
                ) : null}
                {account.isMain ? (
                  <span
                    className={cn(
                      'rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white'
                    )}
                  >
                    메인
                  </span>
                ) : null}
              </div>
              <div className={cn('flex flex-wrap gap-2')}>
                <button
                  type="button"
                  onClick={() => onLogin(account)}
                  disabled={isPending}
                  className={secondaryButtonClassName}
                >
                  로그인
                </button>
                {!account.isMain ? (
                  <button
                    type="button"
                    onClick={() => onSetMain(account.id)}
                    disabled={isPending}
                    className={ghostButtonClassName}
                  >
                    메인 설정
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemove(account.id)}
                  disabled={isPending}
                  className={dangerButtonClassName}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
