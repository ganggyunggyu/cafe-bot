import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ACCOUNT_ID = 'dyulp';
const PASSWORD = 'akfalwk12';
const CAFE_ID = '25460974';
const MENU_ID = 60;
const SESSION_DIR = join(process.cwd(), '.playwright-session');

const loadCookies = (accountId: string) => {
  const cookiesFile = join(SESSION_DIR, `${accountId}-cookies.json`);
  if (!existsSync(cookiesFile)) return [];
  try { return JSON.parse(readFileSync(cookiesFile, 'utf-8')); }
  catch { return []; }
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const cookies = loadCookies(ACCOUNT_ID);
  if (cookies.length > 0) await context.addCookies(cookies);

  const page = await context.newPage();

  // 로그인
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle', timeout: 15000 });
  if (page.url().includes('nidlogin.login')) {
    console.log(`[LOGIN] ${ACCOUNT_ID} 로그인 중...`);
    await page.fill('input#id', ACCOUNT_ID);
    await page.fill('input#pw', PASSWORD);
    await page.click('button.btn_login, button#log\\.login');
    await page.waitForTimeout(3000);
  }
  console.log('[LOGIN] 완료');

  // 카페 먼저 방문 (쿠키 세션 활성화)
  await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  // API로 글 목록 조회
  const apiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${CAFE_ID}&search.menuid=${MENU_ID}&search.page=1&search.perPage=30&search.queryType=lastArticle&search.boardtype=L`;

  const apiResult: any = await page.evaluate(async (url: string) => {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    return await res.json();
  }, apiUrl);

  const articleList = apiResult?.message?.result?.articleList ?? [];
  console.log(`\n[API] 글 ${articleList.length}개 조회`);

  // 유저 글만 필터 (운영자 제외 - 운영자는 보통 cafeManager 등)
  const userArticles = articleList
    .filter((a: any) => !a.isManagerPost && !a.subject?.includes('공지') && !a.subject?.includes('EVENT'))
    .slice(0, 15);

  console.log(`[FILTER] 유저 글 ${userArticles.length}개\n`);

  const posts: { title: string; content: string; commentCount: number; author: string }[] = [];

  for (let i = 0; i < userArticles.length; i++) {
    const article = userArticles[i];
    const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${article.articleId}`;

    try {
      await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      const fh = await page.$('iframe#cafe_main');
      const fr = fh ? await fh.contentFrame() : null;
      const r = fr ?? page;

      const content = await r.evaluate(() => {
        const el =
          document.querySelector('.se-viewer') ||
          document.querySelector('.article_viewer') ||
          document.querySelector('div.se-main-container');
        return el?.textContent?.replace(/\s+/g, ' ').trim() || '';
      });

      posts.push({
        title: article.subject,
        author: article.nickname,
        commentCount: article.commentCount,
        content: content.slice(0, 600),
      });

      console.log(`── [${i + 1}] ${article.subject} (댓글 ${article.commentCount}개)`);
      console.log(`   작성자: ${article.nickname}`);
      console.log(`   본문: ${content.slice(0, 300)}`);
      console.log('');
    } catch (e) {
      console.log(`[SKIP] ${article.articleId}: ${e}`);
    }
  }

  await browser.close();

  console.log('\n\n===== 수집 완료 =====');
  console.log(`총 ${posts.length}개 유저 글 분석`);
  console.log('\n[본문 길이 분포]');
  posts.forEach((p, i) => console.log(`  글${i+1}: ${p.content.length}자 / 댓글 ${p.commentCount}개`));
};

main().catch(console.error);
