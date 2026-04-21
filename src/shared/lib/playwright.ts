import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join(process.cwd(), '.playwright-session');
const COOKIES_FILE = join(SESSION_DIR, 'naver-cookies.json');

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export const getBrowser = async (): Promise<Browser> => {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
}

export const getContext = async (accountId?: string): Promise<BrowserContext> => {
  if (!context) {
    const b = await getBrowser();

    const useFingerprint = process.env.FINGERPRINT_ENABLED === 'true' && accountId;
    let contextOptions: Parameters<typeof b.newContext>[0] = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    };

    if (useFingerprint) {
      const { getProfileForAccount } = await import('./fingerprint');
      const profile = getProfileForAccount(accountId);
      contextOptions = {
        userAgent: profile.userAgent,
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        locale: profile.locale,
        timezoneId: profile.timezoneId,
        colorScheme: profile.colorScheme,
      };
    }

    context = await b.newContext(contextOptions);

    if (useFingerprint) {
      const { getProfileForAccount, applyStealth } = await import('./fingerprint');
      await applyStealth(context, getProfileForAccount(accountId!));
    }

    const cookies = loadCookies();
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }
  }
  return context;
}

export const getPage = async (): Promise<Page> => {
  const ctx = await getContext();
  const pages = ctx.pages();
  if (pages.length > 0) {
    return pages[0];
  }
  return ctx.newPage();
}

export const saveCookies = async (): Promise<void> => {
  if (!context) return;

  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const cookies = await context.cookies();
  writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export const loadCookies = (): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}> => {
  if (!existsSync(COOKIES_FILE)) {
    return [];
  }

  try {
    const data = readFileSync(COOKIES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export const closeBrowser = async (): Promise<void> => {
  if (context) {
    await saveCookies();
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export const isLoggedIn = async (): Promise<boolean> => {
  const page = await getPage();

  try {
    await page.goto('https://nid.naver.com/nidlogin.login', {
      waitUntil: 'networkidle',
      timeout: 10000,
    });

    const url = page.url();
    return !url.includes('nidlogin.login');
  } catch {
    return false;
  }
}
