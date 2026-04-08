import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
} from "../src/shared/lib/multi-session";

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = "25460974";
const ARTICLE_ID = 289308;
const ARTICLE_URL = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${ARTICLE_ID}`;

interface CommentTask {
  accountId: string;
  password: string;
  content: string;
  isReply?: boolean;
  replyToNick?: string; // 대댓글 대상 닉네임의 일부
}

const writeComment = async (task: CommentTask): Promise<boolean> => {
  const { accountId, password, content, isReply, replyToNick } = task;
  
  await acquireAccountLock(accountId);
  try {
    const loggedIn = await isAccountLoggedIn(accountId);
    if (!loggedIn) {
      const r = await loginAccount(accountId, password);
      if (!r.success) {
        console.log(`  ❌ ${accountId} 로그인 실패: ${r.error}`);
        return false;
      }
    }

    const page = await getPageForAccount(accountId);
    await page.goto(ARTICLE_URL, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(2000);

    if (isReply && replyToNick) {
      // 대댓글: 해당 닉네임의 댓글에서 "답글" 버튼 찾기
      const commentItems = await page.$$('.CommentItem');
      let found = false;
      
      for (const item of commentItems) {
        const nickEl = await item.$('.comment_nickname');
        const nick = await nickEl?.textContent() || '';
        
        if (nick.includes(replyToNick)) {
          // 답글 버튼 클릭
          const replyBtn = await item.$('.comment_info_button');
          if (replyBtn) {
            await replyBtn.click();
            await page.waitForTimeout(500);
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        console.log(`  ⚠️ 답글 대상 "${replyToNick}" 댓글을 찾지 못함`);
        // 그냥 일반 댓글로 작성
      }
    }

    // 댓글 입력 영역 찾기
    const textArea = await page.$('.comment_inbox_text textarea, .CommentWriter textarea');
    if (!textArea) {
      // 에디터 방식
      const editorArea = await page.$('.comment_inbox .se-text-paragraph, .CommentWriter .se-text-paragraph');
      if (editorArea) {
        await editorArea.click();
        await page.waitForTimeout(300);
        await page.keyboard.type(content, { delay: 80 });
      } else {
        console.log(`  ❌ ${accountId} 댓글 입력 영역 없음`);
        return false;
      }
    } else {
      await textArea.click();
      await page.waitForTimeout(300);
      await textArea.fill(content);
    }

    await page.waitForTimeout(500);

    // 등록 버튼
    const submitBtn = await page.$('.comment_inbox_write .btn_register, .CommentWriter .btn_register, button.btn_register');
    if (!submitBtn) {
      console.log(`  ❌ ${accountId} 등록 버튼 없음`);
      return false;
    }

    await submitBtn.click();
    await page.waitForTimeout(2000);

    await saveCookiesForAccount(accountId);
    console.log(`  ✅ ${accountId} 댓글 작성 완료: "${content.slice(0, 40)}..."`);
    return true;
  } catch (e) {
    console.log(`  ❌ ${accountId} 에러: ${e instanceof Error ? e.message : e}`);
    return false;
  } finally {
    releaseAccountLock(accountId);
  }
};

const main = async () => {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  
  const user = await User.findOne({ loginId: "21lab", isActive: true }).lean();
  if (!user) throw new Error("user not found");
  
  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const accountMap = new Map(accounts.map((a) => [a.accountId, a]));
  
  // 한려담원 추천 댓글 — 아직 이 글에 댓글 안 단 계정 사용
  const newCommenter = accountMap.get("0ehz3cb2") || accountMap.get("umhu0m83");
  const writerAccount = accountMap.get("uqgidh2690");
  
  if (!newCommenter || !writerAccount) throw new Error("필요한 계정 없음");

  const tasks: CommentTask[] = [
    {
      accountId: newCommenter.accountId,
      password: newCommenter.password,
      content: "저는 이경제 먹다가 한려담원 흑염소진액으로 바꿨는데 솔직히 맛이나 농도가 더 나은 것 같아요, 가격도 이경제보다 합리적이었고 무엇보다 진하게 잘 우려낸 느낌이라 만족하면서 먹고 있어요",
    },
    {
      accountId: writerAccount.accountId,
      password: writerAccount.password,
      content: "오 한려담원이요? 처음 들어보는 브랜드인데 이경제보다 낫다니 궁금하네요, 혹시 어디서 구매하셨어요?",
      isReply: true,
      replyToNick: newCommenter.nickname?.slice(0, 3) || "오차",
    },
    {
      accountId: newCommenter.accountId,
      password: newCommenter.password,
      content: "저는 공식몰에서 샀는데 네이버에서 한려담원 검색하면 바로 나와요! 첫 구매 할인도 있었던 것 같아요 ㅎㅎ",
      isReply: true,
      replyToNick: writerAccount.nickname?.slice(0, 3) || "달리",
    },
  ];

  console.log(`\n=== 한려담원 댓글 추가 (${tasks.length}건) ===\n`);

  for (let i = 0; i < tasks.length; i++) {
    console.log(`[${i + 1}/${tasks.length}] ${tasks[i].accountId}...`);
    await writeComment(tasks[i]);
    
    // 다음 댓글까지 30-60초 대기
    if (i < tasks.length - 1) {
      const delay = 30000 + Math.random() * 30000;
      console.log(`  ⏳ ${Math.round(delay / 1000)}초 대기...\n`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.log("\n=== 완료 ===");
};

main()
  .then(async () => { try { await mongoose.disconnect(); } catch {} process.exit(0); })
  .catch(async (e) => { console.error(e); try { await mongoose.disconnect(); } catch {} process.exit(1); });
