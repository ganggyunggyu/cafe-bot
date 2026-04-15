import { chromium, type Page, type Response } from 'playwright';

const PROFILE_PORT = 18828;
const PROFILE_NAME = 'heavyzebra240';
const CAFE_ID = '25227349';
const MENU_ID = '21';
const MEMBER_ARTICLES_URL =
  'https://m.cafe.naver.com/ca-fe/web/cafes/25227349/members/-RWiyWzkikcvlbaSi_piKOWDNZ9Zp_QalvEHXU9cNGo/articles';
const WRITE_URL = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/write?boardType=L&menuId=${MENU_ID}`;
const TITLE = `[OpenClaw 실브라우저 점검] ${new Date().toISOString()}`;
const BODY_LINES = [
  '실브라우저 작성글 반영 여부 점검 본문입니다.',
  '등록 직후 작성글 UI와 article API 상태를 같이 확인합니다.',
];

type NetworkEvent = {
  status: number;
  url: string;
  method: string;
  body?: string;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const summarizeResponseBody = async (response: Response): Promise<string | undefined> => {
  try {
    return (await response.text()).slice(0, 2000);
  } catch {
    return undefined;
  }
};

const main = async (): Promise<void> => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PROFILE_PORT}`);
  const [context] = browser.contexts();

  if (!context) {
    throw new Error('OpenClaw profile context not found');
  }

  const networkEvents: NetworkEvent[] = [];
  const attachNetworkLogger = (page: Page): void => {
    page.on('response', async (response) => {
      const url = response.url();
      if (
        url.includes('/editor/v2.0/') ||
        url.includes('article.cafe.naver.com/gw/v4/') ||
        url.includes('ArticleRead.nhn')
      ) {
        networkEvents.push({
          status: response.status(),
          url,
          method: response.request().method(),
          body: await summarizeResponseBody(response),
        });
      }
    });
  };

  for (const page of context.pages()) {
    attachNetworkLogger(page);
  }

  const writePage = await context.newPage();
  const ownPostsPage = await context.newPage();
  attachNetworkLogger(writePage);
  attachNetworkLogger(ownPostsPage);

  await ownPostsPage.goto(MEMBER_ARTICLES_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  await writePage.goto(WRITE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  await writePage.waitForTimeout(3_000);

  const latestBefore = await ownPostsPage
    .locator('strong')
    .first()
    .innerText()
    .catch(() => '');
  const latestDateBefore = await ownPostsPage
    .locator('text=/\\d{4}\\.\\d{2}\\.\\d{2}\\./')
    .first()
    .innerText()
    .catch(() => '');

  const boardButton = writePage.locator('.FormSelectButton button.button').first();
  if (await boardButton.isVisible().catch(() => false)) {
    const boardText = ((await boardButton.innerText().catch(() => '')).trim() || '').replace(/\s+/g, ' ');
    if (!boardText.includes('건강 챌린지')) {
      await boardButton.click();
      await writePage.getByRole('button', { name: /^건강 챌린지/ }).last().click();
      await writePage.waitForTimeout(800);
    }
  }

  const titleInput = writePage.locator('.FlexableTextArea textarea.textarea_input, textarea.textarea_input').first();
  await titleInput.click();
  await titleInput.fill('');
  await titleInput.type(TITLE, { delay: 40 });

  const paragraph = writePage.locator('div[contenteditable="true"]').last();
  await paragraph.click();
  await writePage.keyboard.press('Meta+A');
  await writePage.keyboard.press('Backspace');
  await writePage.keyboard.type(BODY_LINES.join('\n'), { delay: 30 });
  await writePage.waitForTimeout(1_000);

  const editorCreatePromise = writePage.waitForResponse(
    (response) =>
      response.url().includes(`/editor/v2.0/cafes/${CAFE_ID}/menus/${MENU_ID}/articles`) &&
      response.request().method() === 'POST',
    { timeout: 20_000 }
  ).catch(() => null);

  const articleApiPromise = writePage.waitForResponse(
    (response) =>
      response.url().includes(`article.cafe.naver.com/gw/v4/cafes/${CAFE_ID}/articles/`) &&
      response.request().method() === 'GET',
    { timeout: 20_000 }
  ).catch(() => null);

  await writePage.locator('a.BaseButton--skinGreen').click({ timeout: 10_000 });
  await sleep(10_000);

  const editorCreateResponse = await editorCreatePromise;
  const articleApiResponse = await articleApiPromise;

  await ownPostsPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await ownPostsPage.waitForTimeout(2_000);

  const latestAfter = await ownPostsPage
    .locator('strong')
    .first()
    .innerText()
    .catch(() => '');
  const latestDateAfter = await ownPostsPage
    .locator('text=/\\d{4}\\.\\d{2}\\.\\d{2}\\./')
    .first()
    .innerText()
    .catch(() => '');

  const matchingOwnPostCount = await ownPostsPage
    .locator(`text=${TITLE}`)
    .count()
    .catch(() => 0);

  console.log(`profile=${PROFILE_NAME}`);
  console.log(`writeUrl=${WRITE_URL}`);
  console.log(`ownPostsUrl=${MEMBER_ARTICLES_URL}`);
  console.log(`title=${TITLE}`);
  console.log(`latestBefore=${latestBefore}`);
  console.log(`latestDateBefore=${latestDateBefore}`);
  console.log(`latestAfter=${latestAfter}`);
  console.log(`latestDateAfter=${latestDateAfter}`);
  console.log(`matchingOwnPostCount=${matchingOwnPostCount}`);
  console.log(`writePageUrlAfterSubmit=${writePage.url()}`);
  console.log(`editorCreateStatus=${editorCreateResponse?.status() ?? 'timeout'}`);
  console.log(
    `editorCreateBody=${editorCreateResponse ? JSON.stringify((await summarizeResponseBody(editorCreateResponse)) || '') : 'timeout'}`
  );
  console.log(`articleApiStatus=${articleApiResponse?.status() ?? 'timeout'}`);
  console.log(
    `articleApiBody=${articleApiResponse ? JSON.stringify((await summarizeResponseBody(articleApiResponse)) || '') : 'timeout'}`
  );
  console.log('recentNetwork=');
  for (const event of networkEvents.slice(-20)) {
    console.log(`${event.method} ${event.status} ${event.url}`);
    if (event.body) {
      console.log(`  body=${event.body}`);
    }
  }

  await browser.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
