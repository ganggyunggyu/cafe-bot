import { signIn } from '@/shared/lib/auth';
import { cn } from '@/shared/lib/cn';

export default function LoginPage() {
  return (
    <div className={cn('min-h-screen bg-(--background) flex items-center justify-center p-6')}>
      <div className={cn('w-full max-w-sm space-y-8')}>
        <div className={cn('text-center space-y-2')}>
          <div
            className={cn(
              'mx-auto h-14 w-14 rounded-2xl bg-(--accent) text-white flex items-center justify-center text-xl font-bold'
            )}
          >
            CB
          </div>
          <h1 className={cn('text-2xl font-semibold text-(--ink) mt-4')}>
            Cafe Bot
          </h1>
          <p className={cn('text-sm text-(--ink-muted)')}>
            네이버 카페 자동 발행 시스템
          </p>
        </div>

        <div className={cn('rounded-2xl border border-(--border-light) bg-(--surface) p-6 space-y-6')}>
          <div className={cn('space-y-2 text-center')}>
            <h2 className={cn('text-lg font-semibold text-(--ink)')}>
              로그인
            </h2>
            <p className={cn('text-sm text-(--ink-muted)')}>
              네이버 계정으로 시작하세요
            </p>
          </div>

          <form
            action={async () => {
              'use server';
              await signIn('naver', { redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className={cn(
                'w-full rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition-all',
                'bg-(--accent) hover:bg-(--accent-hover)'
              )}
            >
              네이버로 로그인
            </button>
          </form>

          <p className={cn('text-xs text-(--ink-tertiary) text-center')}>
            로그인 후 자동으로 홈으로 이동합니다
          </p>
        </div>

        <div className={cn('grid grid-cols-2 gap-3')}>
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface) p-4')}>
            <p className={cn('text-sm font-medium text-(--ink)')}>OAuth 인증</p>
            <p className={cn('text-xs text-(--ink-muted) mt-1')}>토큰 기반 세션 관리</p>
          </div>
          <div className={cn('rounded-xl border border-(--border-light) bg-(--surface) p-4')}>
            <p className={cn('text-sm font-medium text-(--ink)')}>즉시 시작</p>
            <p className={cn('text-xs text-(--ink-muted) mt-1')}>로그인 후 바로 사용</p>
          </div>
        </div>
      </div>
    </div>
  );
}
