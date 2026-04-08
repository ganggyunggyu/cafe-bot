/**
 * 쇼핑지름신 광고 글 댓글 차단 스크립트
 *
 * 내용 변경 없이 댓글 설정만 OFF로 토글합니다.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/block-comments.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { PublishedArticle } from "../src/shared/models";
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  closeAllContexts,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = "21lab";
const CAFE_ID = "25729954"; // 쇼핑지름신
const DELAY_MS = 8000;

// 수정 대상 articleId 목록 (DB 쿼리로 채워짐)
let TARGET_ARTICLE_IDS: number[] = [];

const blockComments = async (
  accountId: string,
  password: string,
  articleId: number,
): Promise<boolean> => {
  await acquireAccountLock(accountId);
  try {
    const loggedIn = await isAccountLoggedIn(accountId);
    if (!loggedIn) {
      const r = await loginAccount(accountId, password);
      if (!r.success) {
        console.log(`  ❌ 로그인 실패: ${r.error}`);
        return false;
      }
    }

    const page = await getPageForAccount(accountId);
    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${articleId}/modify`;
    await page.goto(modifyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // 에디터 로딩 대기
    try {
      await page.waitForSelector(
        "p.se-text-paragraph, .FlexableTextArea textarea.textarea_input",
        { timeout: 15000 },
      );
    } catch {
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

    // 댓글 체크박스 찾아서 OFF로 변경
    try {
      const settingArea = await page.$(".setting_area");
      if (settingArea) {
        await settingArea.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      }

      const cb = await page.$("#coment");
      if (!cb) {
        console.log(`  ⚠️ #${articleId} 댓글 체크박스 못 찾음`);
        return false;
      }

      const checked = await cb.evaluate(
        (el) => (el as HTMLInputElement).checked,
      );
      if (checked) {
        // 현재 댓글 허용 → 차단으로 변경
        const label = await page.$('label[for="coment"]');
        if (label) await label.click();
        else await cb.click();
        console.log(`  🔒 #${articleId} 댓글 차단`);
        await page.waitForTimeout(300);
      } else {
        console.log(`  ℹ️ #${articleId} 이미 댓글 차단 상태`);
      }
    } catch {
      console.log(`  ⚠️ #${articleId} 댓글 설정 변경 실패`);
      return false;
    }

    // 수정 완료 버튼 클릭
    const submitBtn = await page.$(
      "a.BaseButton--skinGreen, a.BaseButton",
    );
    if (!submitBtn) {
      console.log(`  ❌ #${articleId} 수정 버튼 없음`);
      return false;
    }
    await submitBtn.click();

    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
    } catch {
      await page.waitForTimeout(3000);
    }

    await saveCookiesForAccount(accountId);
    return true;
  } catch (error) {
    console.log(
      `  ❌ #${articleId} 오류: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  } finally {
    releaseAccountLock(accountId);
  }
};

const AD_KEYWORDS = [
  "흑염소",
  "조리원",
  "난임",
  "임산부",
  "임신",
  "시험관",
  "착상",
  "출산",
  "보양식",
  "골다공증",
  "갱년기",
  "영양제",
  "면역력",
  "한약",
  "보약",
  "한려담원",
  "오쏘몰",
  "밥 안먹는 아이",
  "혈행개선",
  "수족냉증",
  "당뇨",
  "기력회복",
];

const isAdKeyword = (keyword: string | undefined): boolean => {
  if (!keyword) return false;
  return AD_KEYWORDS.some((ak) => keyword.includes(ak));
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({
    loginId: LOGIN_ID,
    isActive: true,
  }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  // 현재 활성 글쓰기 계정만
  const ACTIVE_WRITERS = ["ags2oigb", "precede1451", "iealpx8p"];
  const accounts = await Account.find({
    userId: user.userId,
    accountId: { $in: ACTIVE_WRITERS },
    isActive: true,
  }).lean();
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  const writerIds = new Set(accounts.map((a) => a.accountId));

  // DB에서 쇼핑지름신 광고 글 조회
  const allArticles = await PublishedArticle.find({
    cafeId: CAFE_ID,
  })
    .sort({ createdAt: -1 })
    .lean();

  const targets = allArticles.filter(
    (a) => isAdKeyword(a.keyword) && writerIds.has(a.writerAccountId),
  );

  console.log(`=== 쇼핑지름신 광고 댓글 차단 (${targets.length}건) ===\n`);

  // 계정별로 그룹핑
  const byAccount = new Map<string, typeof targets>();
  for (const a of targets) {
    const list = byAccount.get(a.writerAccountId) || [];
    list.push(a);
    byAccount.set(a.writerAccountId, list);
  }

  for (const [accountId, articles] of byAccount) {
    console.log(`\n--- ${accountId} (${articles.length}건) ---`);
  }

  let success = 0;
  let fail = 0;
  let skip = 0;
  let idx = 0;

  for (const article of targets) {
    idx++;
    const account = accountMap.get(article.writerAccountId);
    if (!account) {
      console.log(
        `[${idx}/${targets.length}] ❌ 계정 없음: ${article.writerAccountId}`,
      );
      fail++;
      continue;
    }

    console.log(
      `[${idx}/${targets.length}] #${article.articleId} (${article.writerAccountId}) "${article.keyword}"`,
    );

    const ok = await blockComments(
      account.accountId,
      account.password,
      article.articleId,
    );

    if (ok) success++;
    else fail++;

    if (idx < targets.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(
    `\n=== 완료: 성공 ${success}건 / 실패 ${fail}건 / 스킵 ${skip}건 ===`,
  );
};

main()
  .then(async () => {
    try {
      await closeAllContexts();
    } catch {}
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("block-comments failed:", e);
    try {
      await closeAllContexts();
    } catch {}
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
