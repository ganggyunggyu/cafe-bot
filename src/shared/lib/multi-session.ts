import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join(process.cwd(), '.playwright-session');

// HMR에서 상태 유지 (Next.js dev 모듈 재평가 대응)
const g = globalThis as typeof globalThis & {
  __pwBrowser?: Browser | null;
  __pwContexts?: Map<string, BrowserContext>;
  __pwAccountLocks?: Map<string, Promise<void>>;
  __pwLockResolvers?: Map<string, () => void>;
  __pwLoginCache?: Map<string, number>;
  __pwLastUsed?: Map<string, number>;
  __pwIdleTimer?: ReturnType<typeof setInterval> | null;
};

if (!g.__pwContexts) g.__pwContexts = new Map();
if (!g.__pwAccountLocks) g.__pwAccountLocks = new Map();
if (!g.__pwLockResolvers) g.__pwLockResolvers = new Map();
if (!g.__pwLoginCache) g.__pwLoginCache = new Map();
if (!g.__pwLastUsed) g.__pwLastUsed = new Map();

const contexts = g.__pwContexts;
const accountLocks = g.__pwAccountLocks;
const lockResolvers = g.__pwLockResolvers;
const loginStatusCache = g.__pwLoginCache;
const lastUsedAt = g.__pwLastUsed;

const LOGIN_CACHE_TTL = 30 * 60 * 1000;
const IDLE_TTL = 5 * 60 * 1000; // 5분 미사용 시 context 정리
const IDLE_CHECK_INTERVAL = 60 * 1000; // 1분마다 체크

const startIdleCleanup = () => {
  if (g.__pwIdleTimer) return;
  g.__pwIdleTimer = setInterval(async () => {
    const now = Date.now();
    for (const [accountId, lastTime] of lastUsedAt) {
      if (now - lastTime < IDLE_TTL) continue;
      if (accountLocks.has(accountId)) continue; // 작업 중이면 스킵

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
};

startIdleCleanup();

export const acquireAccountLock = async (accountId: string): Promise<void> => {
  while (accountLocks.has(accountId)) {
    console.log(`[LOCK] ${accountId} 락 대기 중...`);
    await accountLocks.get(accountId);
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

export const isLoginRedirect = (url: string): boolean => {
  return url.includes('nidlogin.login') || url.includes('nid.naver.com/nidlogin');
};

const getSessionFile = (accountId: string): string => {
  return join(SESSION_DIR, `${accountId}-cookies.json`);
}

export const getBrowser = async (): Promise<Browser> => {
  if (!g.__pwBrowser || !g.__pwBrowser.isConnected()) {
    if (g.__pwBrowser) {
      console.log('[BROWSER] 브라우저 연결 끊김 - 재시작');
      contexts.clear();
      loginStatusCache.clear();
    }
    const isHeadless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    console.log(`[BROWSER] 브라우저 시작 (headless: ${isHeadless})`);
    g.__pwBrowser = await chromium.launch({
      headless: isHeadless,
      slowMo: isHeadless ? 0 : 100,
    });
  }
  return g.__pwBrowser;
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
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const cookies = loadCookiesForAccount(accountId);
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }

  contexts.set(accountId, context);
  return context;
}

export const getPageForAccount = async (accountId: string): Promise<Page> => {
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

  if (g.__pwBrowser) {
    await g.__pwBrowser.close();
    g.__pwBrowser = null;
  }
}

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
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const page = await getPageForAccount(accountId);

    await page.goto('https://nid.naver.com/nidlogin.login', {
      waitUntil: 'networkidle',
    });

    await page.fill('input#id', accountId);
    await page.fill('input#pw', password);
    await page.click('button.btn_login, button#log\\.login');

    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin.login')) {
      return { success: false, error: '로그인 실패. ID/PW를 확인해주세요.' };
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
