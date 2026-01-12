import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join(process.cwd(), '.playwright-session');

let browser: Browser | null = null;
const contexts: Map<string, BrowserContext> = new Map();

// 계정별 락 관리 (동시 접근 방지)
const accountLocks: Map<string, Promise<void>> = new Map();
const lockResolvers: Map<string, () => void> = new Map();

// 로그인 상태 캐시 (TTL: 30분)
const loginStatusCache: Map<string, number> = new Map();
const LOGIN_CACHE_TTL = 30 * 60 * 1000; // 30분

export const acquireAccountLock = async (accountId: string): Promise<void> => {
  // 이전 락이 있으면 대기
  while (accountLocks.has(accountId)) {
    console.log(`[LOCK] ${accountId} 락 대기 중...`);
    await accountLocks.get(accountId);
  }

  // 새 락 생성
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

const getSessionFile = (accountId: string): string => {
  return join(SESSION_DIR, `${accountId}-cookies.json`);
}

export const getBrowser = async (): Promise<Browser> => {
  if (!browser) {
    const isDebug = process.env.PLAYWRIGHT_DEBUG === 'true';
    browser = await chromium.launch({
      headless: !isDebug,
      slowMo: isDebug ? 500 : 0,
    });
  }
  return browser;
}

export const getContextForAccount = async (accountId: string): Promise<BrowserContext> => {
  if (contexts.has(accountId)) {
    return contexts.get(accountId)!;
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
    return pages[0];
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
  // 캐시도 무효화
  loginStatusCache.delete(accountId);
}

export const closeAllContexts = async (): Promise<void> => {
  for (const [accountId, context] of contexts) {
    await saveCookiesForAccount(accountId);
    await context.close();
  }
  contexts.clear();
  loginStatusCache.clear();

  if (browser) {
    await browser.close();
    browser = null;
  }
}

export const isAccountLoggedIn = async (accountId: string): Promise<boolean> => {
  // 캐시 확인 (TTL 내면 페이지 이동 없이 true 반환)
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
      // 로그아웃 상태면 캐시 무효화
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
      return { success: false, error: '로그인 실패. ID/PW 확인해줘.' };
    }

    await saveCookiesForAccount(accountId);

    // 로그인 성공 시 캐시 갱신
    loginStatusCache.set(accountId, Date.now());
    console.log(`[LOGIN] ${accountId} 로그인 완료, 캐시 갱신`);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return { success: false, error: errorMessage };
  }
}
