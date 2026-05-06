/**
 * 오늘 발행된 글에서 댓글-대댓글 관계가 어색한 케이스 검출 + 삭제
 *
 * 어색 패턴:
 *   같은 계정이 reply를 연속으로 단 경우 (writer 자기답글 2개 연속 등).
 *   첫 번째 reply는 유지, 두 번째 이후 reply를 삭제.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-awkward-comments-auto.ts
 */
import mongoose from "mongoose";
import { Account } from "../src/shared/models/account";
import {
  getPageForAccount,
  acquireAccountLock,
  releaseAccountLock,
  isAccountLoggedIn,
  loginAccount,
  closeAllContexts,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;

interface AwkwardTarget {
  articleId: number;
  cafeId: string;
  accountId: string;
  contentSnippet: string;
  fullContent: string;
}

const findConsecutiveReplyTargets = async (): Promise<AwkwardTarget[]> => {
  const db = mongoose.connection.db!;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const articles = await db
    .collection("publishedarticles")
    .find({ createdAt: { $gte: today } })
    .toArray();

  const targets: AwkwardTarget[] = [];
  for (const a of articles) {
    const comments = (a.comments || []).slice().sort(
      (x: any, y: any) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime()
    );
    let prevAcc: string | null = null;
    let prevType: string | null = null;
    for (const c of comments) {
      if (c.type === "reply" && prevType === "reply" && c.accountId === prevAcc) {
        targets.push({
          articleId: typeof a.articleId === "string" ? Number(a.articleId) : a.articleId,
          cafeId: String(a.cafeId),
          accountId: c.accountId,
          contentSnippet: (c.content || "").slice(0, 30),
          fullContent: c.content || "",
        });
      }
      prevAcc = c.accountId;
      prevType = c.type;
    }
  }
  return targets;
};

const deleteCommentOnNaver = async (target: AwkwardTarget): Promise<boolean> => {
  const acc = await Account.findOne({ accountId: target.accountId }).lean();
  if (!acc) {
    console.log(`  계정 없음: ${target.accountId}`);
    return false;
  }

  await acquireAccountLock(target.accountId);
  try {
    const loggedIn = await isAccountLoggedIn(target.accountId);
    if (!loggedIn) {
      const r = await loginAccount(target.accountId, acc.password);
      if (!r.success) {
        console.log(`  로그인 실패: ${r.error}`);
        return false;
      }
    }

    const page = await getPageForAccount(target.accountId);
    page.on("dialog", async (d) => {
      try { await d.accept(); } catch {}
    });

    await page.goto(
      `https://cafe.naver.com/ca-fe/cafes/${target.cafeId}/articles/${target.articleId}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    // Scroll to load all comments
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
    }
    // Click 이전/더보기 댓글 buttons if any
    const moreBtns = await page.$$('button:has-text("이전"), button:has-text("더보기"), a:has-text("더보기")');
    for (const mb of moreBtns) {
      try { await mb.click({ timeout: 1500 }); await page.waitForTimeout(800); } catch {}
    }

    const commentElements = await page.$$(".CommentItem, .comment_item, li.comment, .comment-area li");
    const normalize = (s: string) => s.replace(/\s+/g, "").replace(/[.,…ㅋㅎㅠㅜ]/g, "");
    const targetNorm = normalize(target.fullContent).slice(0, 30);
    const targetSnipNorm = normalize(target.contentSnippet).slice(0, 15);

    for (const el of commentElements) {
      const text = await el.evaluate((node) => node.textContent || "");
      const textNorm = normalize(text);
      if (!textNorm.includes(targetNorm) && !textNorm.includes(targetSnipNorm)) continue;

      const optionBtn = await el.$(".comment_tool_button");
      if (!optionBtn) {
        console.log(`  더보기 버튼 없음 (article=${target.articleId})`);
        continue;
      }
      await optionBtn.click();
      await page.waitForTimeout(500);

      const allBtns = await page.$$("button, a");
      for (const btn of allBtns) {
        const btnText = await btn.evaluate((node) => node.textContent?.trim() || "");
        if (btnText === "삭제") {
          await btn.click();
          await page.waitForTimeout(2000);
          console.log(`  ✅ 삭제: article=${target.articleId} acc=${target.accountId} "${target.contentSnippet.slice(0, 20)}..."`);
          return true;
        }
      }
      console.log(`  삭제 버튼 못 찾음 (article=${target.articleId})`);
      await page.keyboard.press("Escape");
      return false;
    }

    console.log(`  댓글 매칭 안됨 (article=${target.articleId} acc=${target.accountId} key="${target.contentSnippet.slice(0, 20)}")`);
    return false;
  } finally {
    releaseAccountLock(target.accountId);
  }
};

const removeFromDb = async (target: AwkwardTarget): Promise<void> => {
  const db = mongoose.connection.db!;
  await db.collection("publishedarticles").updateOne(
    { articleId: target.articleId },
    {
      $pull: {
        comments: {
          accountId: target.accountId,
          content: target.fullContent,
        },
      },
    }
  );
};

const main = async (): Promise<void> => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const targets = await findConsecutiveReplyTargets();
  console.log(`=== 연속 동일계정 reply ${targets.length}건 발견 ===`);
  for (const t of targets) {
    console.log(`  article=${t.articleId} cafe=${t.cafeId} acc=${t.accountId} "${t.contentSnippet}..."`);
  }

  if (targets.length === 0) {
    console.log("\n수정할 댓글 없음");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log("\n=== 삭제 진행 ===");
  let deleted = 0;
  for (const t of targets) {
    const ok = await deleteCommentOnNaver(t);
    if (ok) {
      await removeFromDb(t);
      deleted++;
    }
  }

  console.log(`\n=== 완료: ${deleted}/${targets.length}건 삭제 ===`);
  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
