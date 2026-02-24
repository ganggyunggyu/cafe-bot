import type { Page, Frame } from 'playwright';
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  invalidateLoginCache,
  isLoginRedirect,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';
import { incrementActivity } from '@/shared/models/daily-activity';

export interface LikeResult {
  accountId: string;
  success: boolean;
  error?: string;
  articleLiked?: boolean;
  commentLiked?: boolean;
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

  console.log(`[LIKE] ${id} 세션 만료 감지 - 재로그인 시도`);
  invalidateLoginCache(id);

  const reloginResult = await loginAccount(id, password);
  if (!reloginResult.success) {
    return { success: false, error: `세션 만료 후 재로그인 실패: ${reloginResult.error}` };
  }

  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return { success: true };
};

const getCommentRoot = async (page: Page): Promise<Page | Frame> => {
  const frameHandle = await page.$('iframe#cafe_main');
  const frame = await frameHandle?.contentFrame();
  if (frame) {
    try {
      await frame.waitForSelector('.article_viewer, .se-viewer', { timeout: 5000 });
      return frame;
    } catch {
      // iframe 로드 실패 시 page 사용
    }
  }
  return page;
};

export const likeArticleWithAccount = async (
  account: NaverAccount,
  cafeId: string,
  articleId: number
): Promise<LikeResult> => {
  const { id, password } = account;

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { accountId: id, success: false, error: loginCheck.error };
    }

    const page = await getPageForAccount(id);
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`;

    const navResult = await navigateToArticle(page, articleUrl, id, password);
    if (!navResult.success) {
      return { accountId: id, success: false, error: navResult.error };
    }

    const notFoundIndicator = await page.$('.error_content, .deleted_article, .no_article');
    if (notFoundIndicator) {
      return { accountId: id, success: false, error: 'ARTICLE_NOT_READY:글이 아직 처리 중이거나 삭제됨' };
    }

    await page.waitForTimeout(1500);
    const root = await getCommentRoot(page);

    let articleLiked = false;

    // 글 좋아요 버튼 찾기 (root → page 폴백)
    let likeButton = await root.$('a.u_likeit_list_btn._button[data-type="like"]');
    if (!likeButton) {
      likeButton = await page.$('a.u_likeit_list_btn._button[data-type="like"]');
    }

    if (likeButton) {
      const isLiked = await likeButton.evaluate(
        (el) => el.classList.contains('on') || el.getAttribute('aria-pressed') === 'true'
      );
      if (!isLiked) {
        await likeButton.click();
        console.log(`[LIKE] ${id} 글 좋아요 클릭 - articleId: ${articleId}`);
        await page.waitForTimeout(500);
        articleLiked = true;
      } else {
        console.log(`[LIKE] ${id} 이미 좋아요 누름 - articleId: ${articleId}`);
        articleLiked = true;
      }
    } else {
      console.log(`[LIKE] ${id} 좋아요 버튼 없음 - articleId: ${articleId}`);
    }

    await saveCookiesForAccount(id);

    if (articleLiked) {
      await incrementActivity(id, cafeId, 'likes');
    }

    return { accountId: id, success: true, articleLiked };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    return { accountId: id, success: false, error: errorMsg };
  } finally {
    releaseAccountLock(id);
  }
};
