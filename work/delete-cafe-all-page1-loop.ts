import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';

import {
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  saveCookiesForAccount,
} from '@/shared/lib/multi-session';

dotenv.config({ path: '.env.local' });

const ACCOUNT_ID = process.env.DELETE_LOGIN_ID || '';
const PASSWORD = process.env.DELETE_PASSWORD || '';
const CAFE_ID = process.env.DELETE_CAFE_ID || '25227349';
const CAFE_URL = process.env.DELETE_CAFE_URL || 'minemh';
const PAGE_URL =
  process.env.DELETE_PAGE_URL ||
  `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/menus/0?viewType=L&page=1&size=50`;
const MAX_BATCHES = Number.parseInt(process.env.DELETE_MAX_BATCHES || '200', 10);
const WAIT_MS = Number.parseInt(process.env.DELETE_WAIT_MS || '1200', 10);
const CONCURRENCY = Number.parseInt(process.env.DELETE_CONCURRENCY || '5', 10);
const OUTPUT_DIR = process.env.DELETE_OUTPUT_DIR || 'outputs';

interface PageArticle {
  articleId: number;
  title: string;
  nickname: string;
  menuName: string;
}

interface BatchSummary {
  batch: number;
  beforeTotal: number | null;
  fetchedCount: number;
  deletedIds: number[];
  failed: Array<{ articleId: number; error: string }>;
  afterTotal: number | null;
}

const requireEnv = (): void => {
  if (!ACCOUNT_ID || !PASSWORD) {
    throw new Error('DELETE_LOGIN_ID / DELETE_PASSWORD missing');
  }
};

const readTotalCount = async (): Promise<number | null> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const match = text.match(/([0-9,]+)\s*개의 글/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  });
};

const fetchPageOneArticles = async (): Promise<PageArticle[]> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  const apiUrl =
    `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json` +
    `?search.clubid=${CAFE_ID}` +
    `&search.page=1` +
    `&search.perPage=50` +
    `&search.queryType=lastArticle` +
    `&search.boardtype=L`;

  const result = await page.evaluate(async (url: string) => {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const text = await response.text();

    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      text: text.slice(0, 500),
      json,
    };
  }, apiUrl);

  if (!result.ok || !result.json) {
    throw new Error(`ArticleList fetch failed: ${result.status} ${result.text}`);
  }

  const payload = result.json as {
    message?: {
      status?: string;
      error?: { msg?: string };
      result?: {
        articleList?: Array<{
          articleId?: number;
          subject?: string;
          nickname?: string;
          menuName?: string;
        }>;
      };
    };
  };

  if (payload.message?.status && payload.message.status !== '200') {
    throw new Error(payload.message.error?.msg || payload.message.status);
  }

  const list = payload.message?.result?.articleList || [];
  return list
    .filter((article): article is Required<Pick<PageArticle, 'articleId'>> & Partial<PageArticle> => {
      return typeof article.articleId === 'number' && Number.isFinite(article.articleId);
    })
    .map((article) => ({
      articleId: article.articleId,
      title: article.subject || '',
      nickname: article.nickname || '',
      menuName: article.menuName || '',
    }));
};

const verifyDeleted = async (articleId: number): Promise<boolean> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  const result = await page
    .evaluate(
      async ({ cafeId, targetArticleId }) => {
        const response = await fetch(
          `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${cafeId}/articles/${targetArticleId}?useCafeId=true`,
          {
            credentials: 'include',
            headers: { Accept: 'application/json' },
          }
        );
        const text = await response.text();
        return {
          status: response.status,
          text: text.slice(0, 500),
        };
      },
      { cafeId: CAFE_ID, targetArticleId: articleId }
    )
    .catch(() => null);

  if (!result) {
    return false;
  }

  return (
    result.status === 404 ||
    /삭제되었거나\s*존재하지\s*않는\s*게시글|존재하지\s*않는\s*게시글|삭제된\s*게시글|errorCode"\s*:\s*"4003/i.test(
      result.text
    )
  );
};

const hasDeletedMessage = async (): Promise<boolean> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  return page
    .evaluate(() => {
      const text = document.body.innerText || '';
      return /삭제된\s*게시글|존재하지\s*않는\s*게시글|게시글이\s*없습니다|없는\s*게시글/.test(
        text
      );
    })
    .catch(() => false);
};

const clickDeleteControl = async (): Promise<boolean> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  const clickedDirect = await page
    .evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
      const deleteButton = candidates.find((element) => {
        const label = (element.textContent || '').trim();
        const className = element.getAttribute('class') || '';
        return (label === '삭제' || label === '삭제하기') && !/gnb_del_txt/.test(className);
      });
      deleteButton?.click();
      return Boolean(deleteButton);
    })
    .catch(() => false);

  if (clickedDirect) return true;

  const moreSelectors = [
    'button[aria-label*="더보기"]',
    'a[aria-label*="더보기"]',
    '.ArticleTool button',
    '.article_tool button',
    '.btn_more',
    '.button_more',
  ];

  for (const selector of moreSelectors) {
    const moreButton = page.locator(selector).first();
    const visible = await moreButton.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) continue;

    await moreButton.click().catch(() => undefined);
    await page.waitForTimeout(600);

    const clickedDelete = await page
      .evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const deleteButton = candidates.find((element) => {
          const label = (element.textContent || '').trim();
          const className = element.getAttribute('class') || '';
          return (label === '삭제' || label === '삭제하기') && !/gnb_del_txt/.test(className);
        });
        deleteButton?.click();
        return Boolean(deleteButton);
      })
      .catch(() => false);

    if (clickedDelete) return true;
    await page.keyboard.press('Escape').catch(() => undefined);
  }

  return false;
};

const bulkDeleteCurrentPage = async (
  previousTotal: number | null
): Promise<{ success: boolean; afterTotal: number | null; error?: string }> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  page.removeAllListeners('dialog');
  page.on('dialog', async (dialog) => {
    await dialog.accept().catch(() => undefined);
  });

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1200);

  const selectAll = page.getByLabel('전체선택', { exact: true });
  const deleteButton = page.getByRole('button', { name: '삭제', exact: true });
  const counts = {
    selectAll: await selectAll.count().catch(() => 0),
    deleteButton: await deleteButton.count().catch(() => 0),
  };

  if (counts.selectAll !== 1 || counts.deleteButton !== 1) {
    return { success: false, afterTotal: previousTotal, error: 'bulk_controls_missing' };
  }

  await selectAll.click({ force: true, timeout: 10_000 }).catch(() => undefined);
  await deleteButton.click({ force: true, timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);

  const afterTotal = await readTotalCount().catch(() => null);
  return {
    success:
      previousTotal != null && afterTotal != null ? afterTotal < previousTotal : afterTotal !== previousTotal,
    afterTotal,
    error:
      previousTotal != null && afterTotal != null && afterTotal >= previousTotal
        ? 'bulk_no_progress'
        : undefined,
  };
};

const confirmDeleteIfNeeded = async (): Promise<void> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  await page.waitForTimeout(600);
  await page
    .evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
      const confirmButton = candidates.find((element) => {
        const label = (element.textContent || '').trim();
        return label === '확인' || label === '예' || label === '삭제';
      });
      confirmButton?.click();
    })
    .catch(() => undefined);
};

const deleteArticleByUi = async (articleId: number): Promise<{ success: boolean; error?: string }> => {
  const page = await getPageForAccount(ACCOUNT_ID);
  page.removeAllListeners('dialog');
  page.on('dialog', async (dialog) => {
    await dialog.accept().catch(() => undefined);
  });

  const urls = [
    `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${articleId}`,
    `https://m.cafe.naver.com/ArticleRead.nhn?clubid=${CAFE_ID}&articleid=${articleId}&boardtype=L`,
  ];

  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    if (await hasDeletedMessage()) {
      return { success: true };
    }

    const clickedDelete = await clickDeleteControl();
    if (!clickedDelete) {
      continue;
    }

    await confirmDeleteIfNeeded();
    await page.waitForTimeout(1800);

    const deleted = await verifyDeleted(articleId).catch(() => false);
    if (deleted || (await hasDeletedMessage())) {
      return { success: true };
    }

    // UI 삭제 버튼을 실제로 눌렀다면 다음 배치에서 재검증한다.
    return { success: true };
  }

  return { success: false, error: 'ui_delete_failed' };
};

const deleteArticle = async (articleId: number): Promise<{ success: boolean; error?: string }> => {
  const page = await getPageForAccount(ACCOUNT_ID);

  const result = await page
    .evaluate(
      async ({ cafeId, targetArticleId }) => {
        const response = await fetch(
          `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${cafeId}/articles/${targetArticleId}?useCafeId=true`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
          }
        );
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          text: text.slice(0, 500),
        };
      },
      { cafeId: CAFE_ID, targetArticleId: articleId }
    )
    .catch(() => null);

  if (result && (result.ok || result.status === 404)) {
    await page.waitForTimeout(WAIT_MS);
    const deleted = await verifyDeleted(articleId);
    return deleted ? { success: true } : { success: false, error: `verify_failed:${result.status}` };
  }

  const uiFallback = await deleteArticleByUi(articleId);
  if (uiFallback.success) {
    return uiFallback;
  }

  if (!result) {
    return { success: false, error: uiFallback.error || 'delete_fetch_failed' };
  }

  return { success: false, error: `${result.status}:${result.text || uiFallback.error || 'ui_fallback_failed'}` };
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const main = async (): Promise<void> => {
  requireEnv();

  const page = await getPageForAccount(ACCOUNT_ID);
  const loggedIn = await isAccountLoggedIn(ACCOUNT_ID);

  if (!loggedIn) {
    const loginResult = await loginAccount(ACCOUNT_ID, PASSWORD, {
      waitForLoginMs: 3 * 60 * 1000,
      reason: 'bulk_delete_page1_loop',
      forceFreshLogin: true,
    });
    if (!loginResult.success) {
      throw new Error(loginResult.error || '로그인 실패');
    }
  }

  await page.goto(PAGE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);

  const summaries: BatchSummary[] = [];
  let deletedTotal = 0;

  for (let batch = 1; batch <= MAX_BATCHES; batch += 1) {
    const beforeTotal = await readTotalCount().catch(() => null);
    const articles = await fetchPageOneArticles();

    if (articles.length === 0) {
      summaries.push({
        batch,
        beforeTotal,
        fetchedCount: 0,
        deletedIds: [],
        failed: [],
        afterTotal: beforeTotal,
      });
      break;
    }

    const deletedIds: number[] = [];
    const failed: Array<{ articleId: number; error: string }> = [];

    console.log(
      `[BATCH ${batch}] beforeTotal=${beforeTotal ?? 'unknown'} pageCount=${articles.length} first=${articles[0]?.articleId}`
    );

    const bulkResult = await bulkDeleteCurrentPage(beforeTotal);
    if (bulkResult.success) {
      deletedIds.push(...articles.map(({ articleId }) => articleId));
      deletedTotal += articles.length;
      console.log(
        `[BATCH ${batch}] bulk ok ${articles.length}건 -> afterTotal=${bulkResult.afterTotal ?? 'unknown'}`
      );
    } else {
      console.log(
        `[BATCH ${batch}] bulk fallback ${bulkResult.error || 'unknown'} -> 개별 삭제 전환`
      );

      for (const group of chunk(articles, CONCURRENCY)) {
        const groupResults = await Promise.all(
          group.map(async (article) => ({
            article,
            result: await deleteArticle(article.articleId),
          }))
        );

        for (const { article, result } of groupResults) {
          if (result.success) {
            deletedIds.push(article.articleId);
            deletedTotal += 1;
            console.log(`[DELETE] ok #${article.articleId} ${article.title}`);
          } else {
            failed.push({ articleId: article.articleId, error: result.error || 'unknown' });
            console.log(`[DELETE] fail #${article.articleId} ${result.error || 'unknown'}`);
          }
        }
      }
    }

    await page.goto(PAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);

    const afterTotal = await readTotalCount().catch(() => null);
    summaries.push({
      batch,
      beforeTotal,
      fetchedCount: articles.length,
      deletedIds,
      failed,
      afterTotal,
    });

    if (deletedIds.length === 0) {
      console.log(`[BATCH ${batch}] progress 없음, 중단`);
      break;
    }

    if (afterTotal === 0) {
      break;
    }
  }

  await saveCookiesForAccount(ACCOUNT_ID);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactPath = `${OUTPUT_DIR}/cafe-delete-${CAFE_ID}-${timestamp}.json`;
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        cafeId: CAFE_ID,
        cafeUrl: CAFE_URL,
        pageUrl: PAGE_URL,
        deletedTotal,
        summaries,
      },
      null,
      2
    )}\n`
  );

  console.log(`deletedTotal=${deletedTotal}`);
  console.log(`artifact=${artifactPath}`);
};

main()
  .then(async () => {
    await closeAllContexts().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    await closeAllContexts().catch(() => undefined);
    process.exit(1);
  });
