import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { NaverAccount } from './account-manager';
import { detectCaptcha, solveCaptchaOnPage } from './captcha-solver';

const SESSION_DIR = join(process.cwd(), '.playwright-session');
const LOGIN_POLL_INTERVAL_MS = 1000;
const DEFAULT_LOGIN_WAIT_MS = 3000;
const SCHEDULE_LOGIN_WAIT_MS = 10 * 60 * 1000;
const SCHEDULE_ACCOUNT_OPEN_INTERVAL_MS = 5 * 1000;
const DEFAULT_SCHEDULE_RESERVATION_TTL_MS = 60 * 60 * 1000;

type LoginAccountOptions = {
  waitForLoginMs?: number;
  pollIntervalMs?: number;
  reason?: string;
};

type WarmupScheduleSessionsOptions = {
  loginWaitMs?: number;
  waitBetweenAccountsMs?: number;
  reason?: string;
  reservationTtlMs?: number;
};

type WarmupScheduleSessionsResult = {
  success: boolean;
  warmedAccountIds: string[];
  failedAccountId?: string;
  error?: string;
};

// HMR에서 상태 유지 (Next.js dev 모듈 재평가 대응)
const g = globalThis as typeof globalThis & {
  __pwBrowser?: Browser | null;
  __pwContexts?: Map<string, BrowserContext>;
  __pwAccountLocks?: Map<string, Promise<void>>;
  __pwLockResolvers?: Map<string, () => void>;
  __pwLoginCache?: Map<string, number>;
  __pwLastUsed?: Map<string, number>;
  __pwIdleTimer?: ReturnType<typeof setInterval> | null;
  __pwBrowserLaunching?: Promise<Browser> | null;
  __pwReservedSessions?: Map<string, Set<string>>;
};

if (!g.__pwContexts) g.__pwContexts = new Map();
if (!g.__pwAccountLocks) g.__pwAccountLocks = new Map();
if (!g.__pwLockResolvers) g.__pwLockResolvers = new Map();
if (!g.__pwLoginCache) g.__pwLoginCache = new Map();
if (!g.__pwLastUsed) g.__pwLastUsed = new Map();
if (!g.__pwReservedSessions) g.__pwReservedSessions = new Map();

const contexts = g.__pwContexts;
const accountLocks = g.__pwAccountLocks;
const lockResolvers = g.__pwLockResolvers;
const loginStatusCache = g.__pwLoginCache;
const lastUsedAt = g.__pwLastUsed;
const reservedSessions = g.__pwReservedSessions;

const LOGIN_CACHE_TTL = 30 * 60 * 1000;
const IDLE_TTL_MIN = 10 * 60 * 1000;
const IDLE_TTL_MAX = 15 * 60 * 1000;
const randomIdleTtl = () => IDLE_TTL_MIN + Math.floor(Math.random() * (IDLE_TTL_MAX - IDLE_TTL_MIN));
const IDLE_CHECK_INTERVAL = 60 * 1000; // 1분마다 체크

const startIdleCleanup = () => {
  if (g.__pwIdleTimer) return;
  g.__pwIdleTimer = setInterval(async () => {
    const now = Date.now();
    for (const [accountId, lastTime] of lastUsedAt) {
      if (now - lastTime < randomIdleTtl()) continue;
      if (accountLocks.has(accountId)) continue; // 작업 중이면 스킵
      if (reservedSessions.get(accountId)?.size) continue; // 예약 세션은 유지

      const ctx = contexts.get(accountId);
      if (!ctx) {
        lastUsedAt.delete(accountId);
        continue;
      }

      try {
        await saveCookiesForAccount(accountId);
        await ctx.close();
        console.log(`[IDLE] ${accountId} context 정리 (${Math.round((now - lastTime) / 1000)}초 idle)`);
      } catch {
        // 이미 닫혀있을 수 있음
      }
      contexts.delete(accountId);
      loginStatusCache.delete(accountId);
      lastUsedAt.delete(accountId);
    }
  }, IDLE_CHECK_INTERVAL);
  g.__pwIdleTimer.unref?.();
};

startIdleCleanup();

const ACCOUNT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export const acquireAccountLock = async (accountId: string): Promise<void> => {
  const deadline = Date.now() + ACCOUNT_LOCK_TIMEOUT_MS;

  while (accountLocks.has(accountId)) {
    if (Date.now() > deadline) {
      console.warn(`[LOCK] ${accountId} 락 타임아웃 (${ACCOUNT_LOCK_TIMEOUT_MS / 1000}초) — 강제 해제`);
      lockResolvers.get(accountId)?.();
      accountLocks.delete(accountId);
      lockResolvers.delete(accountId);
      break;
    }
    console.log(`[LOCK] ${accountId} 락 대기 중...`);
    await Promise.race([
      accountLocks.get(accountId),
      new Promise<void>(r => setTimeout(r, 5000)),
    ]);
  }

  let resolver: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  accountLocks.set(accountId, lockPromise);
  lockResolvers.set(accountId, resolver!);
  console.log(`[LOCK] ${accountId} 락 획득`);
};

export const releaseAccountLock = (accountId: string): void => {
  const resolver = lockResolvers.get(accountId);
  if (resolver) {
    resolver();
    accountLocks.delete(accountId);
    lockResolvers.delete(accountId);
    console.log(`[LOCK] ${accountId} 락 해제`);
  }
};

export const invalidateLoginCache = (accountId: string): void => {
  loginStatusCache.delete(accountId);
  console.log(`[LOGIN] ${accountId} 캐시 무효화됨`);
};

export const reserveAccountSession = (
  accountId: string,
  reservationId: string
): void => {
  const reservations = reservedSessions.get(accountId) ?? new Set<string>();
  reservations.add(reservationId);
  reservedSessions.set(accountId, reservations);
  touchAccount(accountId);
  console.log(`[SESSION] ${accountId} 세션 예약 (${reservations.size}개)`);
};

export const releaseAccountSession = (
  accountId: string,
  reservationId?: string
): void => {
  const reservations = reservedSessions.get(accountId);
  if (!reservations) return;

  if (reservationId) {
    reservations.delete(reservationId);
  } else {
    reservations.clear();
  }

  if (reservations.size === 0) {
    reservedSessions.delete(accountId);
    console.log(`[SESSION] ${accountId} 세션 예약 해제`);
    return;
  }

  reservedSessions.set(accountId, reservations);
  console.log(`[SESSION] ${accountId} 세션 예약 유지 (${reservations.size}개)`);
};

export const isAccountSessionReserved = (accountId: string): boolean => {
  return (reservedSessions.get(accountId)?.size ?? 0) > 0;
};

export const isLoginRedirect = (url: string): boolean => {
  return url.includes('nidlogin.login') || url.includes('nid.naver.com/nidlogin');
};

const getSessionFile = (accountId: string): string => {
  return join(SESSION_DIR, `${accountId}-cookies.json`);
}

export const getBrowser = async (): Promise<Browser> => {
  if (g.__pwBrowser && g.__pwBrowser.isConnected()) {
    return g.__pwBrowser;
  }

  // 이미 다른 호출이 브라우저 생성 중이면 그 결과를 기다림
  if (g.__pwBrowserLaunching) {
    return g.__pwBrowserLaunching;
  }

  g.__pwBrowserLaunching = (async () => {
    if (g.__pwBrowser) {
      console.log('[BROWSER] 브라우저 연결 끊김 - 재시작');
      contexts.clear();
      loginStatusCache.clear();
      lastUsedAt.clear();
    }
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    console.log(`[BROWSER] 브라우저 시작 (headless: ${isHeadless})`);
    g.__pwBrowser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 0 : 100,
    });
    return g.__pwBrowser;
  })();

  try {
    const browser = await g.__pwBrowserLaunching;
    return browser;
  } finally {
    g.__pwBrowserLaunching = null;
  }
}

const isContextAlive = (ctx: BrowserContext): boolean => {
  try {
    ctx.pages();
    return true;
  } catch {
    return false;
  }
};

export const getContextForAccount = async (accountId: string): Promise<BrowserContext> => {
  lastUsedAt.set(accountId, Date.now());

  const existing = contexts.get(accountId);
  if (existing && isContextAlive(existing)) {
    return existing;
  }

  if (existing) {
    console.log(`[CONTEXT] ${accountId} 컨텍스트 죽음 감지 - 재생성`);
    contexts.delete(accountId);
    loginStatusCache.delete(accountId);
  }

  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  });

  const cookies = loadCookiesForAccount(accountId);
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }

  contexts.set(accountId, context);
  return context;
}

export const touchAccount = (accountId: string): void => {
  lastUsedAt.set(accountId, Date.now());
};

export const getPageForAccount = async (accountId: string): Promise<Page> => {
  lastUsedAt.set(accountId, Date.now());
  const ctx = await getContextForAccount(accountId);
  const pages = ctx.pages();
  if (pages.length > 0) {
    const page = pages[0];
    if (!page.isClosed()) return page;
  }
  return ctx.newPage();
}

export const saveCookiesForAccount = async (accountId: string): Promise<void> => {
  const context = contexts.get(accountId);
  if (!context) return;

  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const cookies = await context.cookies();
  writeFileSync(getSessionFile(accountId), JSON.stringify(cookies, null, 2));
}

export const loadCookiesForAccount = (accountId: string): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}> => {
  const sessionFile = getSessionFile(accountId);

  if (!existsSync(sessionFile)) {
    return [];
  }

  try {
    const data = readFileSync(sessionFile, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export const closeContextForAccount = async (accountId: string): Promise<void> => {
  const context = contexts.get(accountId);
  if (context) {
    await saveCookiesForAccount(accountId);
    await context.close();
    contexts.delete(accountId);
  }
  loginStatusCache.delete(accountId);
}

export const closeAllContexts = async (): Promise<void> => {
  for (const [accountId, context] of contexts) {
    await saveCookiesForAccount(accountId);
    await context.close();
  }
  contexts.clear();
  loginStatusCache.clear();
  reservedSessions.clear();

  if (g.__pwBrowser) {
    await g.__pwBrowser.close();
    g.__pwBrowser = null;
  }
}

const waitForLoginCompletion = async (
  page: Page,
  accountId: string,
  options?: LoginAccountOptions
): Promise<boolean> => {
  const waitForLoginMs = options?.waitForLoginMs ?? DEFAULT_LOGIN_WAIT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? LOGIN_POLL_INTERVAL_MS;
  const startedAt = Date.now();

  if (waitForLoginMs > DEFAULT_LOGIN_WAIT_MS) {
    console.log(
      `[LOGIN] ${accountId} 로그인 완료 대기 중 (${Math.round(
        waitForLoginMs / 1000
      )}초, reason: ${options?.reason || 'default'})`
    );
  }

  while (Date.now() - startedAt <= waitForLoginMs) {
    touchAccount(accountId);

    if (!isLoginRedirect(page.url())) {
      return true;
    }

    const remainingTime = waitForLoginMs - (Date.now() - startedAt);
    if (remainingTime <= 0) {
      break;
    }

    await page.waitForTimeout(Math.min(pollIntervalMs, remainingTime));
  }

  return !isLoginRedirect(page.url());
};

const scheduleSessionReservationRelease = (
  accountId: string,
  reservationId: string,
  reservationTtlMs: number
): void => {
  const timer = setTimeout(() => {
    releaseAccountSession(accountId, reservationId);
  }, reservationTtlMs);

  timer.unref?.();
};

export const isAccountLoggedIn = async (accountId: string): Promise<boolean> => {
  const cachedTime = loginStatusCache.get(accountId);
  if (cachedTime && Date.now() - cachedTime < LOGIN_CACHE_TTL) {
    console.log(`[LOGIN] ${accountId} 캐시 히트 (${Math.round((Date.now() - cachedTime) / 1000)}초 전 확인)`);
    return true;
  }

  const page = await getPageForAccount(accountId);

  try {
    await page.goto('https://nid.naver.com/nidlogin.login', {
      waitUntil: 'networkidle',
      timeout: 10000,
    });

    const url = page.url();
    const isLoggedIn = !url.includes('nidlogin.login');

    if (isLoggedIn) {
      loginStatusCache.set(accountId, Date.now());
      console.log(`[LOGIN] ${accountId} 로그인 상태 캐시됨`);
    } else {
      loginStatusCache.delete(accountId);
    }

    return isLoggedIn;
  } catch {
    loginStatusCache.delete(accountId);
    return false;
  }
}

export const loginAccount = async (
  accountId: string,
  password: string,
  options?: LoginAccountOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    const page = await getPageForAccount(accountId);

    await page.goto('https://nid.naver.com/nidlogin.login', {
      waitUntil: 'networkidle',
    });

    await page.fill('input#id', accountId);
    await page.fill('input#pw', password);
    await page.click('button.btn_login, button#log\\.login');

    // 로그인 버튼 클릭 후 3초 대기
    await page.waitForTimeout(3000);

    // 캡차 감지 및 자동 풀이
    if (isLoginRedirect(page.url())) {
      const captchaCheck = await detectCaptcha(page);
      if (captchaCheck.detected) {
        const geminiKey =
          process.env.GEMINI_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.GOOGLE_GENAI_API_KEY;

        if (!geminiKey) {
          return {
            success: false,
            error: 'GEMINI_API_KEY 미설정 — 캡차 자동 풀이 불가',
          };
        }

        const captchaResult = await solveCaptchaOnPage(page, accountId, password);
        if (!captchaResult.solved) {
          return {
            success: false,
            error: `캡차 풀이 실패 (${captchaResult.attempts}회 시도): ${captchaResult.error}`,
          };
        }
      }
    }

    // 캡차 풀이 후에도 로그인 미완료 시 대기
    if (isLoginRedirect(page.url())) {
      const loginCompleted = await waitForLoginCompletion(page, accountId, options);
      if (!loginCompleted) {
        return {
          success: false,
          error: '로그인 대기 시간 초과. 추가 인증 여부를 확인해주세요.',
        };
      }
    }

    await saveCookiesForAccount(accountId);

    loginStatusCache.set(accountId, Date.now());
    console.log(`[LOGIN] ${accountId} 로그인 완료, 캐시 갱신`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return { success: false, error: errorMessage };
  }
}

export const warmupScheduleSessions = async (
  accounts: NaverAccount[],
  options?: WarmupScheduleSessionsOptions
): Promise<WarmupScheduleSessionsResult> => {
  const uniqueAccounts: NaverAccount[] = [];
  const seenAccountIds = new Set<string>();

  for (const account of accounts) {
    if (seenAccountIds.has(account.id)) continue;
    seenAccountIds.add(account.id);
    uniqueAccounts.push(account);
  }

  if (uniqueAccounts.length === 0) {
    return { success: true, warmedAccountIds: [] };
  }

  const reservationId =
    options?.reason ||
    `schedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const waitBetweenAccountsMs =
    options?.waitBetweenAccountsMs ?? SCHEDULE_ACCOUNT_OPEN_INTERVAL_MS;
  const loginWaitMs = options?.loginWaitMs ?? SCHEDULE_LOGIN_WAIT_MS;
  const reservationTtlMs =
    options?.reservationTtlMs ?? DEFAULT_SCHEDULE_RESERVATION_TTL_MS;
  const warmedAccountIds: string[] = [];

  for (let i = 0; i < uniqueAccounts.length; i++) {
    const { id, password } = uniqueAccounts[i];

    reserveAccountSession(id, reservationId);
    await acquireAccountLock(id);

    try {
      console.log(`[SESSION] 스케줄 세션 프리워밍 시작: ${id} (${i + 1}/${uniqueAccounts.length})`);
      const loggedIn = await isAccountLoggedIn(id);

      if (!loggedIn) {
        const loginResult = await loginAccount(id, password, {
          waitForLoginMs: loginWaitMs,
          reason: reservationId,
        });

        if (!loginResult.success) {
          releaseAccountSession(id, reservationId);

          for (const warmedAccountId of warmedAccountIds) {
            releaseAccountSession(warmedAccountId, reservationId);
          }

          return {
            success: false,
            warmedAccountIds,
            failedAccountId: id,
            error: loginResult.error || '로그인 실패',
          };
        }
      }

      warmedAccountIds.push(id);
      scheduleSessionReservationRelease(id, reservationId, reservationTtlMs);
      touchAccount(id);
      console.log(`[SESSION] 스케줄 세션 준비 완료: ${id}`);
    } finally {
      releaseAccountLock(id);
    }

    if (i < uniqueAccounts.length - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitBetweenAccountsMs);
      });
    }
  }

  return { success: true, warmedAccountIds };
};
