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
    result: {
      articleList: Array<{
        articleId: number;
        subject: string;
        nickname: string;
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

/**
 * Naver Cafe REST API로 최신 글 목록 조회
 * 브라우저 컨텍스트 내에서 fetch하므로 쿠키 자동 포함
 */
export const browseCafePosts = async (
  account: NaverAccount,
  cafeId: string,
  options?: {
    menuId?: number;
    page?: number;
    perPage?: number;
    excludeAccountIds?: string[];
  }
): Promise<BrowseCafeResult> => {
  const { id, password } = account;
  const { menuId = 0, page = 1, perPage = 20, excludeAccountIds = [] } = options ?? {};

  await acquireAccountLock(id);

  try {
    const loginCheck = await ensureLoggedIn(id, password);
    if (!loginCheck.success) {
      return { success: false, articles: [], error: loginCheck.error };
    }

    const browserPage = await getPageForAccount(id);

    // Naver 카페 메인 페이지로 이동 (쿠키 컨텍스트 확보)
    await browserPage.goto(`https://cafe.naver.com/ca-fe/cafes/${cafeId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await browserPage.waitForTimeout(1000);

    // 브라우저 컨텍스트 내에서 Naver Cafe REST API 호출
    const apiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${cafeId}&search.menuid=${menuId}&search.page=${page}&search.perPage=${perPage}&search.queryType=lastArticle&search.boardtype=L`;

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
    const rawList = response?.message?.result?.articleList ?? [];

    const articles: CafeArticle[] = rawList
      .map((item) => ({
        articleId: item.articleId,
        subject: item.subject,
        nickname: item.nickname,
        memberKey: item.memberKey,
        readCount: item.readCount,
        likeCount: item.likeItCount,
        commentCount: item.commentCount,
        writeDateTimestamp: item.writeDateTimestamp,
        menuId: item.menuId,
        menuName: item.menuName,
      }))
      .filter((article) => {
        // 자기 글 제외 (본인 + 제외 계정 목록)
        const allExcluded = [id, ...excludeAccountIds];
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

/**
 * 카페 최신 글에서 랜덤으로 N개 선택
 */
export const pickRandomArticles = (articles: CafeArticle[], count: number): CafeArticle[] => {
  const shuffled = [...articles].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};
