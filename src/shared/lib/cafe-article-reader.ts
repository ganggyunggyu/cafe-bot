import {
  acquireAccountLock,
  getPageForAccount,
  invalidateLoginCache,
  isAccountLoggedIn,
  isLoginRedirect,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import type { Frame, Page } from 'playwright';

export interface ReadCafeArticleResult {
  success: boolean;
  cafeId: string;
  articleId: number;
  url: string;
  title?: string;
  content?: string;
  authorNickname?: string;
  error?: string;
}

const ensureLoggedIn = async (
  id: string,
  password: string
): Promise<{ success: true } | { success: false; error: string }> => {
  const loggedIn = await isAccountLoggedIn(id);
  if (loggedIn) return { success: true };

  const loginResult = await loginAccount(id, password);
  if (!loginResult.success) {
    return { success: false, error: loginResult.error || '로그인 실패' };
  }
  return { success: true };
};

const navigateToArticle = async (
  page: Page,
  articleUrl: string,
  id: string,
  password: string
): Promise<{ success: true } | { success: false; error: string }> => {
  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

  const currentUrl = page.url();
  if (!isLoginRedirect(currentUrl)) return { success: true };

  invalidateLoginCache(id);
  const reloginResult = await loginAccount(id, password);
  if (!reloginResult.success) {
    return { success: false, error: `세션 만료 후 재로그인 실패: ${reloginResult.error}` };
  }

  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return { success: true };
};

const normalizeText = (value: string | null | undefined): string => {
  return (value ?? '').replace(/\s+/g, ' ').trim();
};

const getArticleRoot = async (page: Page): Promise<Page | Frame> => {
  try {
    await page.waitForSelector('iframe#cafe_main', { timeout: 10000 });
  } catch {
    return page;
  }

  const frameHandle = await page.$('iframe#cafe_main');
  const frame = await frameHandle?.contentFrame();
  return frame ?? page;
};

const pickFirstText = async (
  root: Page | Frame,
  selectors: string[]
): Promise<string> => {
  for (const selector of selectors) {
    const el = await root.$(selector);
    if (!el) continue;

    const text = await el.evaluate((node) => (node.textContent ?? '').trim());
    const normalized = normalizeText(text);
    if (normalized) return normalized;
  }

  return '';
};

export const readCafeArticleContent = async (
  account: NaverAccount,
  cafeId: string,
  articleId: number
): Promise<ReadCafeArticleResult> => {
  const { id, password } = account;
  const url = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { success: false, cafeId, articleId, url, error: loginCheck.error };
    }

    const page = await getPageForAccount(id);
    const navResult = await navigateToArticle(page, url, id, password);
    if (!navResult.success) {
      return { success: false, cafeId, articleId, url, error: navResult.error };
    }

    const notFoundIndicator = await page.$('.error_content, .deleted_article, .no_article');
    if (notFoundIndicator) {
      return {
        success: false,
        cafeId,
        articleId,
        url,
        error: 'ARTICLE_NOT_READY:글이 아직 처리 중이거나 삭제됨',
      };
    }

    await page.waitForTimeout(1200);
    const root = await getArticleRoot(page);

    const title = await pickFirstText(root, [
      'h3.title_text',
      '.tit_area .title_text',
      '.article_title',
      'strong.title',
    ]);

    const authorNickname = await pickFirstText(root, [
      '.nick_box .nick',
      '.writer .nick',
      '.profile_info .nick',
      '.nickname',
    ]);

    const content = await pickFirstText(root, [
      '.se-viewer',
      '.article_viewer',
      '.ContentRenderer',
      'div.se-main-container',
    ]);

    if (!content) {
      return {
        success: false,
        cafeId,
        articleId,
        url,
        error: 'ARTICLE_NOT_READY:본문을 찾을 수 없음',
      };
    }

    await saveCookiesForAccount(id);

    return { success: true, cafeId, articleId, url, title, authorNickname, content };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { success: false, cafeId, articleId, url, error: errorMsg };
  } finally {
    releaseAccountLock(id);
  }
};
