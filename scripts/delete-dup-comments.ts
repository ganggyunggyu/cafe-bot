/**
 * 중복 댓글 삭제 - 최종 실행 스크립트
 *
 * 1) 각 계정 로그인
 * 2) 샤넬오픈런 글 스캔 (pages 1-15)
 * 3) CommentItem--mine 중 중복인 것 → 더보기 → 삭제
 */

import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from '../src/shared/lib/multi-session';
import type { Page } from 'playwright';

const WRITER_ACCOUNTS = [
  { id: 'ags2oigb', password: 'dlrbghdqudtls', nick: '에이지' },
  { id: 'wound12567', password: 'akfalwk12', nick: '디디아' },
  { id: 'ynattg', password: 'sadito0229!', nick: 'yna' },
  { id: 'mixxut', password: 'sadito0229!', nick: '에앤과1' },
];

const CAFE_ID = '25460974';

const deleteDuplicatesOnArticle = async (
  page: Page,
  articleId: number,
  nickname: string,
): Promise<number> => {
  const url = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${articleId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  // 내 댓글 찾기 (CommentItem--mine)
  try {
    await page.waitForSelector('.CommentItem', { timeout: 5000 });
  } catch {
    return 0;
  }

  const myCommentData = await page.evaluate(() => {
    const items = document.querySelectorAll('.CommentItem--mine');
    const data: { id: string; content: string; commentId: string }[] = [];
    for (const item of items) {
      const content = item.querySelector('.comment_text_view')?.textContent?.trim() ||
                      item.querySelector('.text_comment')?.textContent?.trim() || '';
      const id = item.id || '';
      const dataCid = item.getAttribute('data-cid') || '';
      const commentId = dataCid.split('-').pop() || id;
      data.push({ id, content, commentId });
    }
    return data;
  });

  if (myCommentData.length <= 1) return 0;

  // 중복 찾기 (같은 content가 2개 이상)
  const contentGroups = new Map<string, typeof myCommentData>();
  for (const c of myCommentData) {
    if (!c.content) continue;
    if (!contentGroups.has(c.content)) contentGroups.set(c.content, []);
    contentGroups.get(c.content)!.push(c);
  }

  let deleteCount = 0;

  for (const [content, group] of contentGroups) {
    if (group.length <= 1) continue;

    // 첫 번째만 남기고 나머지 삭제
    const toDelete = group.slice(1);
    console.log(`  "${content.slice(0, 30)}..." ×${group.length} → ${toDelete.length}개 삭제`);

    for (const target of toDelete) {
      try {
        // 더보기 버튼 클릭
        const moreBtn = await page.$(`#commentItem${target.id}`);
        if (!moreBtn) {
          // ID로 못 찾으면 해당 CommentItem 내부에서 찾기
          const commentItem = await page.$(`li#${target.id}.CommentItem--mine`);
          if (!commentItem) continue;
          const btn = await commentItem.$('button.comment_tool_button');
          if (!btn) continue;
          await btn.click();
        } else {
          await moreBtn.click();
        }

        await page.waitForTimeout(500);

        // 삭제 버튼 찾기 (드롭다운에서)
        const deleteBtn = await page.$('button:has-text("삭제"), a:has-text("삭제")');
        if (!deleteBtn) {
          // 대안: data-log-actionid="delete" 등
          const altDelete = await page.$('[class*="delete"], [data-action="delete"]');
          if (altDelete) {
            await altDelete.click();
          } else {
            // 드롭다운 메뉴에서 직접 찾기
            const menuItems = await page.$$('.layer_menu button, .layer_menu a, .comment_popup button, .comment_popup a, [role="menu"] button, [role="menuitem"]');
            for (const item of menuItems) {
              const text = await item.textContent();
              if (text?.includes('삭제')) {
                await item.click();
                break;
              }
            }
          }
          await page.waitForTimeout(500);
        } else {
          await deleteBtn.click();
          await page.waitForTimeout(500);
        }

        // 확인 다이얼로그 처리
        const confirmBtn = await page.$('button:has-text("확인")');
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForTimeout(500);
        }

        // dialog가 없으면 브라우저 confirm
        page.once('dialog', async (dialog) => {
          await dialog.accept();
        });

        await page.waitForTimeout(300);
        deleteCount++;

        if (deleteCount % 10 === 0) {
          console.log(`    ... ${deleteCount}개 삭제 완료`);
        }
      } catch (err) {
        // 개별 삭제 실패는 무시하고 계속
      }
    }
  }

  return deleteCount;
};

const main = async () => {
  for (const account of WRITER_ACCOUNTS) {
    console.log(`\n====== ${account.id} (${account.nick}) ======`);

    await acquireAccountLock(account.id);
    try {
      const loggedIn = await isAccountLoggedIn(account.id);
      if (!loggedIn) {
        const result = await loginAccount(account.id, account.password);
        if (!result.success) { console.log(`  로그인 실패: ${result.error}`); continue; }
      }
      console.log(`  로그인 완료`);

      const page = await getPageForAccount(account.id);

      // 카페 페이지로 이동 (API 컨텍스트)
      await page.goto(`https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}`, {
        waitUntil: 'domcontentloaded', timeout: 15000,
      });
      await page.waitForTimeout(2000);

      // 글 목록 가져오기 (pages 1-15)
      const allArticles: any[] = [];
      for (let pg = 1; pg <= 15; pg++) {
        const apiUrl = `https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json?search.clubid=${CAFE_ID}&search.page=${pg}&search.perPage=50&search.queryType=lastArticle&search.boardtype=L`;
        const result = await page.evaluate(async (u: string) => {
          try {
            const res = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
            if (!res.ok) return { error: true };
            return await res.json();
          } catch { return { error: true }; }
        }, apiUrl);

        if (result.error) break;
        const articles = result?.message?.result?.articleList || [];
        allArticles.push(...articles);
        if (articles.length < 50) break;
      }

      const targets = allArticles.filter((a: any) => a.commentCount >= 3);
      console.log(`  글 ${allArticles.length}개 중 댓글3+: ${targets.length}개\n`);

      let totalDeleted = 0;

      for (let i = 0; i < targets.length; i++) {
        const article = targets[i];
        try {
          const deleted = await deleteDuplicatesOnArticle(page, article.articleId, account.nick);
          if (deleted > 0) {
            totalDeleted += deleted;
            console.log(`  → #${article.articleId} ${deleted}개 삭제 (총 ${totalDeleted})\n`);
          }
        } catch {
          // 무시
        }

        if ((i + 1) % 50 === 0) {
          console.log(`  ... ${i + 1}/${targets.length} 글 확인, 총 ${totalDeleted}개 삭제`);
        }
      }

      console.log(`\n  === ${account.nick}: 총 ${totalDeleted}개 삭제 ===`);
      await saveCookiesForAccount(account.id);
    } finally {
      releaseAccountLock(account.id);
    }
  }
};

main()
  .then(() => { console.log('\n=== 전체 완료 ==='); process.exit(0); })
  .catch((e) => { console.error('에러:', e); process.exit(1); });
