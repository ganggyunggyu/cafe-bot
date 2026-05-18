import dotenv from 'dotenv';
import mongoose from 'mongoose';
import type { Frame, Page } from 'playwright';
import { Account } from '../src/shared/models/account';
import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
  saveCookiesForAccount,
} from '../src/shared/lib/multi-session';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TARGET = {
  cafeId: '25729954',
  articleId: 11275854,
  accountId: 'dq1h3bjy',
  commentId: '145411317',
  originalContent:
    '컵라면 씬에서 배달앱 켠 거 저도 완전 공감되는데 그 장면 왜 그렇게 맛있어 보이는지 이상하게 편의점 컵라면이 제일 맛있어 보임 드라마에서',
  newContent:
    '컵라면 씬에서 배달앱 켠 거 저도 완전 공감돼요ㅠㅠ 그 장면 왜 그렇게 맛있어 보이는지, 이상하게 드라마에 나오는 편의점 컵라면이 제일 맛있어 보이더라고요',
};

const normalize = (value: string): string =>
  value.replace(/\s+/g, '').replace(/[.,…~ㅋㅎㅠㅜ]/g, '').trim();

const getCommentRoot = async (page: Page): Promise<Page | Frame> => {
  try {
    await page.waitForSelector('iframe#cafe_main', { timeout: 5000 });
    const frameHandle = await page.$('iframe#cafe_main');
    const frame = await frameHandle?.contentFrame();
    return frame ?? page;
  } catch {
    return page;
  }
};

const loadMoreComments = async (root: Page | Frame): Promise<void> => {
  for (let i = 0; i < 4; i += 1) {
    try {
      await root.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await root.waitForTimeout(500);
    } catch {}
  }
  const moreButtons = await root.$$('button:has-text("이전"), button:has-text("더보기"), a:has-text("더보기")');
  for (const button of moreButtons) {
    try {
      await button.click({ timeout: 1500 });
      await root.waitForTimeout(500);
    } catch {}
  }
};

const editCommentViaApi = async (page: Page): Promise<{ ok: boolean; status?: number; body?: string }> => {
  return await page.evaluate(async (args: { cafeId: string; articleId: number; commentId: string; content: string }) => {
    const candidates = [
      'https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/' + args.cafeId + '/articles/' + args.articleId + '/comments/' + args.commentId,
      'https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/' + args.cafeId + '/articles/' + args.articleId + '/comments/' + args.commentId,
      'https://apis.naver.com/cafe-web/cafe-articleapi/cafes/' + args.cafeId + '/articles/' + args.articleId + '/comments/' + args.commentId,
    ];
    let lastError = '';
    for (const url of candidates) {
      const res = await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: args.content }),
      });
      let text = '';
      try {
        text = await res.text();
      } catch {}
      if (res.ok) return { ok: true, status: res.status, body: text };
      lastError = 'PUT ' + url + ' -> ' + res.status + ': ' + text.slice(0, 200);
    }
    return { ok: false, body: lastError };
  }, {
    cafeId: TARGET.cafeId,
    articleId: TARGET.articleId,
    commentId: TARGET.commentId,
    content: TARGET.newContent,
  });
};

const editCommentViaDom = async (page: Page): Promise<boolean> => {
  const root = await getCommentRoot(page);
  await loadMoreComments(root);

  const targetNorm = normalize(TARGET.originalContent).slice(0, 40);

  const commentLis = await root.$$('.CommentItem, .comment_item, li.comment, .comment-area li');
  console.log(`  댓글 요소 ${commentLis.length}개 탐색`);

  for (const li of commentLis) {
    const text = await li.evaluate((node) => node.textContent || '');
    if (!normalize(text).includes(targetNorm.slice(0, 25))) continue;

    console.log('  매칭 댓글 발견');

    const btnDump = await li.evaluate((node) => {
      const buttons = Array.from(node.querySelectorAll('button, a'));
      return buttons.map((b) => ({
        tag: b.tagName,
        text: (b.textContent || '').trim().slice(0, 30),
        cls: b.getAttribute('class') || '',
        aria: b.getAttribute('aria-label') || '',
        id: b.id || '',
      }));
    });
    console.log('  댓글 내부 버튼 목록:');
    for (const b of btnDump) {
      console.log(`    ${b.tag} text="${b.text}" cls="${b.cls}" aria="${b.aria}" id="${b.id}"`);
    }

    const moreBtn =
      (await li.$('.comment_tool_button')) ||
      (await li.$('button[aria-label*="더보기"]')) ||
      (await li.$('button[aria-label*="옵션"]')) ||
      (await li.$('button.btn_option')) ||
      (await li.$('button.cmt_func_btn')) ||
      (await li.$('button[class*="more"]')) ||
      (await li.$('button[class*="More"]')) ||
      (await li.$('button:has-text("⋮")')) ||
      (await li.$('button:has-text("...")'));

    if (!moreBtn) {
      console.log('  더보기 버튼 못 찾음');
      continue;
    }
    await moreBtn.click();
    await root.waitForTimeout(700);

    const editBtn = await root.$('button:has-text("수정"), a:has-text("수정")');
    if (!editBtn) {
      console.log('  수정 버튼 못 찾음');
      await page.keyboard.press('Escape');
      continue;
    }
    await editBtn.click();
    await root.waitForTimeout(1500);

    const inputDump = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]'));
      return inputs.map((el) => ({
        tag: el.tagName,
        cls: el.getAttribute('class') || '',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        valueLen: (el as HTMLInputElement | HTMLTextAreaElement).value?.length ?? (el.textContent?.length ?? 0),
      }));
    });
    console.log(`  현재 URL: ${page.url()}`);
    console.log('  페이지 입력 요소 목록:');
    for (const i of inputDump) {
      console.log(`    ${i.tag} cls="${i.cls}" name="${i.name}" id="${i.id}" placeholder="${i.placeholder}" valueLen=${i.valueLen}`);
    }

    const editable =
      (await page.$('textarea')) ||
      (await page.$('input[type="text"]')) ||
      (await page.$('[contenteditable="true"]'));
    if (!editable) {
      console.log('  수정 입력 영역 못 찾음');
      continue;
    }

    const tagName = await editable.evaluate((el) => el.tagName);
    await editable.click();
    if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
      await editable.evaluate((el: HTMLTextAreaElement | HTMLInputElement) => {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } else {
      await editable.evaluate((el: HTMLElement) => {
        el.innerText = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    await editable.type(TARGET.newContent, { delay: 12 });
    await root.waitForTimeout(700);

    const submitDump = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons
        .map((b) => ({ tag: b.tagName, text: (b.textContent || '').trim().slice(0, 20), cls: b.getAttribute('class') || '' }))
        .filter((b) => /등록|수정|확인|저장|완료/.test(b.text));
    });
    console.log('  submit 후보:');
    for (const s of submitDump) {
      console.log(`    ${s.tag} text="${s.text}" cls="${s.cls}"`);
    }

    const saveBtn =
      (await page.$('button:has-text("등록")')) ||
      (await page.$('button:has-text("저장")')) ||
      (await page.$('button:has-text("완료")')) ||
      (await page.$('button:has-text("수정")')) ||
      (await page.$('a:has-text("등록")'));
    if (!saveBtn) {
      console.log('  저장 버튼 못 찾음');
      continue;
    }
    await saveBtn.click();
    await root.waitForTimeout(3000);
    console.log('  ✅ DOM 경로 저장 완료');
    return true;
  }
  return false;
};

const updateDb = async (): Promise<void> => {
  const db = mongoose.connection.db!;
  const r = await db.collection('publishedarticles').updateOne(
    { cafeId: TARGET.cafeId, articleId: TARGET.articleId, 'comments.commentId': TARGET.commentId },
    { $set: { 'comments.$.content': TARGET.newContent } }
  );
  console.log(`  DB 업데이트: matched=${r.matchedCount} modified=${r.modifiedCount}`);

  if (r.matchedCount === 0) {
    const r2 = await db.collection('publishedarticles').updateOne(
      {
        cafeId: TARGET.cafeId,
        articleId: TARGET.articleId,
        'comments.accountId': TARGET.accountId,
        'comments.content': TARGET.originalContent,
      },
      { $set: { 'comments.$.content': TARGET.newContent } }
    );
    console.log(`  DB 업데이트(content match): matched=${r2.matchedCount} modified=${r2.modifiedCount}`);
  }
};

const main = async (): Promise<void> => {
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) throw new Error('MONGODB_URI가 필요합니다.');
  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 10000 });

  const account = await Account.findOne({ accountId: TARGET.accountId, isActive: true }).lean();
  if (!account) throw new Error(`계정 없음: ${TARGET.accountId}`);

  console.log(`=== 댓글 수정 시작 ===`);
  console.log(`  cafeId=${TARGET.cafeId} articleId=${TARGET.articleId} commentId=${TARGET.commentId}`);
  console.log(`  before: ${TARGET.originalContent}`);
  console.log(`  after : ${TARGET.newContent}`);

  await acquireAccountLock(TARGET.accountId);
  let edited = false;
  try {
    const loggedIn = await isAccountLoggedIn(TARGET.accountId);
    if (!loggedIn) {
      const r = await loginAccount(TARGET.accountId, account.password);
      if (!r.success) throw new Error(`로그인 실패: ${r.error}`);
    }

    const page = await getPageForAccount(TARGET.accountId);
    page.on('dialog', async (d) => {
      try {
        await d.accept();
      } catch {}
    });

    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${TARGET.cafeId}/articles/${TARGET.articleId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2500);

    console.log('  -> API 경로 시도');
    const apiResult = await editCommentViaApi(page);
    if (apiResult.ok) {
      console.log('  ✅ API 경로 수정 성공');
      edited = true;
    } else {
      console.log(`  API 실패: ${(apiResult.body || '').slice(0, 200)}`);
      console.log('  -> DOM 경로 시도');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      edited = await editCommentViaDom(page);
      if (!edited) {
        console.log('  -> 모바일 DOM 경로 시도');
        await page.goto(`https://m.cafe.naver.com/ca-fe/web/cafes/${TARGET.cafeId}/articles/${TARGET.articleId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await page.waitForTimeout(2500);
        edited = await editCommentViaDom(page);
      }
    }

    await saveCookiesForAccount(TARGET.accountId);
  } finally {
    releaseAccountLock(TARGET.accountId);
  }

  if (edited) {
    await updateDb();
    console.log('=== 완료 ===');
  } else {
    console.log('=== 실패: 수정 못함 ===');
    process.exitCode = 1;
  }

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(async (error) => {
    console.error(error);
    try {
      await closeAllContexts();
    } catch {}
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
