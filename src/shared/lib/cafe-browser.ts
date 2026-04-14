import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from '@/shared/lib/multi-session';
import type { NaverAccount } from '@/shared/lib/account-manager';

export interface CafeArticle {
  articleId: number;
  subject: string;
  nickname: string;
  maskedMemberId?: string;
  memberKey?: string;
  readCount: number;
  likeCount: number;
  commentCount: number;
  writeDateTimestamp: number;
  menuId: number;
  menuName?: string;
}

export interface BrowseCafeResult {
  success: boolean;
  articles: CafeArticle[];
  error?: string;
}

interface ArticleListApiResponse {
  message: {
    status: string;
    error?: { code: string; msg: string };
    result: {
      articleList: Array<{
        articleId: number;
        subject: string;
        nickname?: string;
        writerNickname?: string;
        maskedMemberId?: string;
        memberKey?: string;
        readCount: number;
        likeItCount: number;
        commentCount: number;
        writeDateTimestamp: number;
        menuId: number;
        menuName?: string;
      }>;
    };
  };
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

export const browseCafePosts = async (
  account: NaverAccount,
  cafeId: string,
  menuId?: number,
  options?: {
    page?: number;
    perPage?: number;
    excludeAccountIds?: string[];
    excludeMemberKeys?: string[];
    cafeUrl?: string;
  }
): Promise<BrowseCafeResult> => {
  const { id, password } = account;
  const {
    page = 1,
    perPage = 20,
    excludeAccountIds = [],
    excludeMemberKeys = [],
    cafeUrl,
  } = options ?? {};

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { success: false, articles: [], error: loginCheck.error };
    }

    const browserPage = await getPageForAccount(id);

    const gotoUrl = cafeUrl
      ? `https://cafe.naver.com/${cafeUrl}`
      : `https://cafe.naver.com/ca-fe/cafes/${cafeId}`;
    await browserPage.goto(gotoUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await browserPage.waitForTimeout(1000);

    const menuParam = menuId != null ? `&search.menuid=${menuId}` : '';
    const apiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${cafeId}${menuParam}&search.page=${page}&search.perPage=${perPage}&search.queryType=lastArticle&search.boardtype=L`;

    const apiResult = await browserPage.evaluate(async (url: string) => {
      try {
        const res = await fetch(url, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, apiUrl);

    if (apiResult.error) {
      console.error(`[CAFE_BROWSER] API 오류: ${apiResult.error}`);
      return { success: false, articles: [], error: apiResult.error };
    }

    const response = apiResult as ArticleListApiResponse;

    if (response.message?.status !== '200') {
      const errorMsg = response.message?.error?.msg || `API status: ${response.message?.status}`;
      console.error(`[CAFE_BROWSER] API 비정상 응답: ${errorMsg}`);
      return { success: false, articles: [], error: errorMsg };
    }

    const rawList = response.message.result?.articleList ?? [];

    const articles: CafeArticle[] = rawList
      .map((item) => ({
        articleId: item.articleId,
        subject: item.subject,
        nickname: item.writerNickname || item.nickname || item.maskedMemberId || '',
        maskedMemberId: item.maskedMemberId,
        memberKey: item.memberKey,
        readCount: item.readCount,
        likeCount: item.likeItCount,
        commentCount: item.commentCount,
        writeDateTimestamp: item.writeDateTimestamp,
        menuId: item.menuId,
        menuName: item.menuName,
      }))
      .filter((article) => {
        const allExcluded = [...excludeMemberKeys, ...excludeAccountIds];
        return !allExcluded.includes(article.memberKey ?? '');
      });

    console.log(`[CAFE_BROWSER] ${id} 카페 ${cafeId} 글 ${rawList.length}개 조회, 필터 후 ${articles.length}개`);

    await saveCookiesForAccount(id);
    return { success: true, articles };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[CAFE_BROWSER] 오류:`, errorMsg);
    return { success: false, articles: [], error: errorMsg };
  } finally {
    releaseAccountLock(id);
  }
};

export const pickRandomArticles = (articles: CafeArticle[], count: number): CafeArticle[] => {
  const shuffled = [...articles].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

export interface CafeMenu {
  menuId: number;
  menuName: string;
  boardType: string;
  articleCount: number;
}

export interface FetchMenuResult {
  success: boolean;
  menus: CafeMenu[];
  error?: string;
}

const EXCLUDED_MENU_KEYWORDS = [
  '공지', '안내', '가입인사', '등업', '운영', '규정',
  '출석', '이벤트', '전체글', '인기글', '베스트',
  '투표', '설문', '신고', '제재', '광고게시판',
];

const isCommentableMenu = (menuName: string): boolean => {
  const lower = menuName.toLowerCase();
  return !EXCLUDED_MENU_KEYWORDS.some((kw) => lower.includes(kw));
};

export const fetchCafeMenuList = async (
  account: NaverAccount,
  cafeId: string,
  cafeUrl: string,
): Promise<FetchMenuResult> => {
  const { id, password } = account;

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { success: false, menus: [], error: loginCheck.error };
    }

    const browserPage = await getPageForAccount(id);

    await browserPage.goto(`https://cafe.naver.com/${cafeUrl}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await browserPage.waitForTimeout(2000);

    // DOM에서 사이드바 메뉴 추출 시도
    const domMenus = await browserPage.evaluate(() => {
      const result: Array<{ menuId: number; menuName: string }> = [];
      const seen = new Set<number>();

      // 전략 1: menuid 포함 링크
      const links = document.querySelectorAll('a[href*="menuid="]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/menuid=(\d+)/);
        if (!match) continue;
        const menuId = parseInt(match[1], 10);
        if (seen.has(menuId)) continue;
        const name = (link.textContent || '').replace(/\d+$/, '').trim();
        if (!name) continue;
        seen.add(menuId);
        result.push({ menuId, menuName: name });
      }

      // 전략 2: data-menu-id 속성
      if (result.length === 0) {
        const items = document.querySelectorAll('[data-menu-id]');
        for (const item of items) {
          const menuId = parseInt(item.getAttribute('data-menu-id') || '0', 10);
          if (!menuId || seen.has(menuId)) continue;
          const name = (item.textContent || '').replace(/\d+$/, '').trim();
          if (!name) continue;
          seen.add(menuId);
          result.push({ menuId, menuName: name });
        }
      }

      // 전략 3: 카페 메뉴 클래스
      if (result.length === 0) {
        const menuItems = document.querySelectorAll('.cafe-menu-item a, .menu-list a, .cafe-menu a');
        for (const item of menuItems) {
          const href = item.getAttribute('href') || '';
          const match = href.match(/menuid=(\d+)|menuId=(\d+)/);
          if (!match) continue;
          const menuId = parseInt(match[1] || match[2], 10);
          if (seen.has(menuId)) continue;
          const name = (item.textContent || '').replace(/\d+$/, '').trim();
          if (!name) continue;
          seen.add(menuId);
          result.push({ menuId, menuName: name });
        }
      }

      return result;
    });

    if (domMenus.length > 0) {
      const commentable = domMenus
        .filter((m) => isCommentableMenu(m.menuName))
        .map((m) => ({ ...m, boardType: 'board', articleCount: 0 }));

      console.log(`[CAFE_MENU] DOM 추출 성공: ${cafeUrl} 전체 ${domMenus.length}개, 댓글 적합 ${commentable.length}개`);
      await saveCookiesForAccount(id);
      return { success: true, menus: commentable };
    }

    // DOM 실패 시 — 전체글보기 API에서 menuId + menuName 수집
    console.log(`[CAFE_MENU] DOM 추출 실패, 전체글보기 API fallback`);

    const menuMap = new Map<number, string>();
    for (let page = 1; page <= 5; page++) {
      const apiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${cafeId}&search.page=${page}&search.perPage=50&search.queryType=lastArticle&search.boardtype=L`;

      const apiResult = await browserPage.evaluate(async (url: string) => {
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) return { error: `HTTP ${res.status}` };
          return await res.json();
        } catch (e) {
          return { error: String(e) };
        }
      }, apiUrl);

      if (apiResult.error) break;

      const response = apiResult as ArticleListApiResponse;
      if (response.message?.status !== '200') break;

      const articles = response.message.result?.articleList ?? [];
      if (articles.length === 0) break;

      for (const article of articles) {
        if (article.menuId && article.menuName && !menuMap.has(article.menuId)) {
          menuMap.set(article.menuId, article.menuName);
        }
      }

      if (menuMap.size >= 20) break;
    }

    const fallbackMenus = [...menuMap.entries()]
      .map(([menuId, menuName]) => ({ menuId, menuName, boardType: 'board', articleCount: 0 }))
      .filter((m) => isCommentableMenu(m.menuName));

    console.log(`[CAFE_MENU] API fallback: ${cafeUrl} 전체 ${menuMap.size}개, 댓글 적합 ${fallbackMenus.length}개`);
    await saveCookiesForAccount(id);
    return { success: true, menus: fallbackMenus };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
    console.error(`[CAFE_MENU] 오류:`, errorMsg);
    return { success: false, menus: [], error: errorMsg };
  } finally {
    releaseAccountLock(id);
  }
};
