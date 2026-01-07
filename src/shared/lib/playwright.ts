import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join(process.cwd(), '.playwright-session');
const COOKIES_FILE = join(SESSION_DIR, 'naver-cookies.json');

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
}

export async function getContext(): Promise<BrowserContext> {
  if (!context) {
    const b = await getBrowser();
    context = await b.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const cookies = loadCookies();
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }
  }
  return context;
}

export async function getPage(): Promise<Page> {
  const ctx = await getContext();
  const pages = ctx.pages();
  if (pages.length > 0) {
    return pages[0];
  }
  return ctx.newPage();
}

export async function saveCookies(): Promise<void> {
  if (!context) return;

  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const cookies = await context.cookies();
  writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

export function loadCookies(): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}> {
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

export async function closeBrowser(): Promise<void> {
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

export async function isLoggedIn(): Promise<boolean> {
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
