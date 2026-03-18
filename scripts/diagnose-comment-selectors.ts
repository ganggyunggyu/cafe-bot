import { chromium } from 'playwright';

const CAFE_ID = process.env.NAVER_CAFE_ID || '31640041';
const ACCOUNT_ID = process.argv[2] || 'compare14310';
const ACCOUNT_PW = process.argv[3] || 'akfalwk12';
const ARTICLE_ID = process.argv[4];

const main = async () => {
  if (!ARTICLE_ID) {
    console.log('사용법: npx tsx scripts/diagnose-comment-selectors.ts [계정ID] [비번] [글번호]');
    console.log('예시: npx tsx scripts/diagnose-comment-selectors.ts compare14310 akfalwk12 12345');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`\n=== 로그인: ${ACCOUNT_ID} ===`);
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.fill('input#id', ACCOUNT_ID);
  await page.fill('input#pw', ACCOUNT_PW);
  await page.click('button.btn_login, button#log\\.login');
  await page.waitForTimeout(3000);

  if (page.url().includes('nidlogin.login')) {
    console.log('로그인 실패');
    await browser.close();
    process.exit(1);
  }
  console.log('로그인 성공\n');

  const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${ARTICLE_ID}`;
  console.log(`=== 글 이동: ${articleUrl} ===`);
  await page.goto(articleUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const root = await page.$('iframe#cafe_main');
  const frame = root ? await root.contentFrame() : page;
  if (!frame) {
    console.log('iframe을 찾을 수 없음');
    await browser.close();
    process.exit(1);
  }

  console.log('\n=== 댓글 DOM 구조 분석 ===\n');

  const allComments = await frame.$$('.CommentItem');
  const topLevel = await frame.$$('.CommentItem:not(.CommentItem--reply)');
  const replies = await frame.$$('.CommentItem.CommentItem--reply');

  console.log(`전체 댓글: ${allComments.length}개`);
  console.log(`상위 댓글: ${topLevel.length}개`);
  console.log(`대댓글(reply): ${replies.length}개\n`);

  console.log('--- 전체 댓글 구조 ---\n');

  for (let i = 0; i < allComments.length; i++) {
    const item = allComments[i];
    const isReply = await item.evaluate((el) => el.classList.contains('CommentItem--reply'));
    const nickname = await item.$eval('.comment_nickname', (el) => el.textContent?.trim() || '').catch(() => '(닉네임없음)');
    const text = await item.$eval('.comment_text_view', (el) => el.textContent?.trim().slice(0, 50) || '').catch(() => '(내용없음)');
    const hasReplyBtn = await item.$('a.comment_info_button');
    const classList = await item.evaluate((el) => Array.from(el.classList).join(', '));
    const id = await item.evaluate((el) => el.id || '(id없음)');
    const dataAttrs = await item.evaluate((el) => {
      const attrs: Record<string, string> = {};
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value;
        }
      }
      return JSON.stringify(attrs);
    });

    const prefix = isReply ? '  ↳ [대댓글]' : '[댓글]';
    console.log(`${prefix} #${i} | ${nickname} | "${text}"`);
    console.log(`   classes: ${classList}`);
    console.log(`   id: ${id}`);
    console.log(`   data-attrs: ${dataAttrs}`);
    console.log(`   답글쓰기 버튼: ${hasReplyBtn ? 'O' : 'X'}`);

    if (hasReplyBtn) {
      const btnText = await hasReplyBtn.evaluate((el) => el.textContent?.trim() || '');
      const btnClass = await hasReplyBtn.evaluate((el) => el.className);
      console.log(`   버튼 텍스트: "${btnText}" | 클래스: ${btnClass}`);
    }
    console.log('');
  }

  console.log('\n=== 대댓글 답글쓰기 버튼 클릭 테스트 ===\n');

  if (replies.length > 0) {
    const firstReply = replies[0];
    const replyBtn = await firstReply.$('a.comment_info_button');

    if (replyBtn) {
      console.log('대댓글의 답글쓰기 버튼 클릭...');
      await replyBtn.click();
      await page.waitForTimeout(1500);

      const replyInput = await frame.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');
      if (replyInput) {
        const inputValue = await replyInput.evaluate((el) => (el as HTMLTextAreaElement).value);
        const placeholder = await replyInput.evaluate((el) => (el as HTMLTextAreaElement).placeholder);
        console.log(`입력창 열림!`);
        console.log(`  현재 값: "${inputValue}"`);
        console.log(`  placeholder: "${placeholder}"`);

        const writerArea = await frame.$('.CommentWriter:has(.btn_cancel)');
        if (writerArea) {
          const writerHtml = await writerArea.evaluate((el) => el.innerHTML.slice(0, 500));
          console.log(`  Writer HTML (앞 500자):\n${writerHtml}`);
        }

        const cancelBtn = await frame.$('.CommentWriter .btn_cancel');
        if (cancelBtn) {
          await cancelBtn.click();
          await page.waitForTimeout(500);
        }
      } else {
        console.log('대댓글 답글 입력창이 열리지 않음');
      }
    } else {
      console.log('대댓글에 답글쓰기 버튼이 없음');
    }
  } else {
    console.log('대댓글이 없어서 테스트 불가');
  }

  console.log('\n=== 상위 댓글 답글쓰기 버튼 클릭 테스트 ===\n');

  if (topLevel.length > 0) {
    const firstTop = topLevel[0];
    const replyBtn = await firstTop.$('a.comment_info_button');

    if (replyBtn) {
      console.log('상위 댓글의 답글쓰기 버튼 클릭...');
      await replyBtn.click();
      await page.waitForTimeout(1500);

      const replyInput = await frame.$('.CommentWriter:has(.btn_cancel) textarea.comment_inbox_text');
      if (replyInput) {
        const inputValue = await replyInput.evaluate((el) => (el as HTMLTextAreaElement).value);
        const placeholder = await replyInput.evaluate((el) => (el as HTMLTextAreaElement).placeholder);
        console.log(`입력창 열림!`);
        console.log(`  현재 값: "${inputValue}"`);
        console.log(`  placeholder: "${placeholder}"`);

        const cancelBtn = await frame.$('.CommentWriter .btn_cancel');
        if (cancelBtn) {
          await cancelBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  }

  await browser.close();
  console.log('\n=== 진단 완료 ===');
};

main().catch((err) => {
  console.error('에러:', err);
  process.exit(1);
});
