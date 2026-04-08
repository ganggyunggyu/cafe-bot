/**
 * 벤타쿠 댓글 차단 글 → 새 원고로 수정 + 댓글 허용
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import {
  getPageForAccount,
  saveCookiesForAccount,
  isAccountLoggedIn,
  loginAccount,
  acquireAccountLock,
  releaseAccountLock,
  closeAllContexts,
} from '../src/shared/lib/multi-session';

const MONGODB_URI = process.env.MONGODB_URI!;
const CAFE_ID = '31642514';
const LOGIN_ID = 'qwzx16';
const DELAY_MS = 10000;

interface ArticleUpdate {
  articleId: number;
  title: string;
  body: string;
}

const UPDATES: ArticleUpdate[] = [
  {
    articleId: 770,
    title: '원오크 내한 드디어!!',
    body: '원오크 내한 콘서트 소식 듣고 진짜 심장 쿵 했어요!! 오랫동안 기다렸던 거라 너무 설레네요.',
  },
  {
    articleId: 769,
    title: '통기타 연습곡 찾았어요',
    body: '오늘 통기타 연습곡 검색하다가 딱 맞는 거 발견했어요. 난이도도 적당하고 멜로디도 좋아서 계속 치게 되더라고요.',
  },
  {
    articleId: 768,
    title: '하이레졸로 듣는 오후',
    body: '오늘 처음으로 하이레졸 음원으로 들어봤어요. 같은 곡인데 이렇게 다르게 들릴 수 있구나 싶었어요.',
  },
  {
    articleId: 766,
    title: '일본 앨범 직구 성공했어요ㅋㅋ',
    body: '드디어 일본 앨범 직구 처음 해봤는데 생각보다 너무 쉬웠어요ㅎㅎ 배송 오는 동안 얼마나 두근거렸는지ㅋㅋ 오늘 열어봤는데 완전 만족이에요!!',
  },
  {
    articleId: 764,
    title: '노이즈캔슬링 새로 샀어요',
    body: '드디어 노이즈캔슬링 헤드폰 질렀어요~ 카페에서 끼고 앉아있었는데 세상이 사라지는 느낌이었어요 이거 진짜 인생템인 것 같아요.',
  },
  {
    articleId: 760,
    title: '일렉기타 중고거래 구경했어요',
    body: '오늘 오후에 할 일 없어서 중고거래 앱 뒤적이다가 일렉기타 매물들만 한참 봤어요. 살 것도 아닌데 구경하다 보면 시간이 훌쩍 가더라고요.',
  },
  {
    articleId: 754,
    title: '이펙터 보드 드디어 완성',
    body: '베이스 이펙터 보드 구성 끝냈는데 생각보다 너무 잘 됐어요! 배치도 딱 마음에 들고 소리도 진짜 만족스러워서 기분이 너무 좋네요.',
  },
  {
    articleId: 752,
    title: '드럼 독학 시작했어요 ㅋㅋ',
    body: '요즘 드럼 독학 연습 중인데 소리 내는 것만으로도 너무 신나요 ㅎㅎ 박자 맞출 때 그 쾌감이 있어서 매일 30분씩 하고 있어요',
  },
];

const modifyArticle = async (
  accountId: string,
  password: string,
  update: ArticleUpdate
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
    const modifyUrl = `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${update.articleId}/modify`;
    await page.goto(modifyUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
      await page.waitForSelector('p.se-text-paragraph, .FlexableTextArea textarea.textarea_input', { timeout: 15000 });
    } catch {
      await page.waitForTimeout(5000);
    }
    await page.waitForTimeout(2000);

    // 제목 수정
    const titleInput = await page.$('.FlexableTextArea textarea.textarea_input, textarea.textarea_input');
    if (!titleInput) {
      console.log(`  ❌ #${update.articleId} 제목 입력창 없음`);
      return false;
    }
    await titleInput.click({ clickCount: 3 });
    await page.waitForTimeout(200);
    await titleInput.fill(update.title);
    await page.waitForTimeout(500);

    // 본문 수정
    const contentArea = await page.$('p.se-text-paragraph');
    if (!contentArea) {
      console.log(`  ❌ #${update.articleId} 본문 입력창 없음`);
      return false;
    }
    await contentArea.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+A');
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    await page.keyboard.type(update.body, { delay: 5 });
    await page.waitForTimeout(500);

    // 댓글 허용 토글
    try {
      const cb = await page.$('#coment');
      if (cb) {
        const checked = await cb.evaluate((el) => (el as HTMLInputElement).checked);
        if (!checked) {
          const label = await page.$('label[for="coment"]');
          if (label) await label.click();
          else await cb.click();
          console.log(`  🔓 #${update.articleId} 댓글 허용`);
          await page.waitForTimeout(300);
        }
      }
    } catch {
      console.log(`  ⚠️ #${update.articleId} 댓글 설정 변경 실패`);
    }

    // 수정 완료
    const submitBtn = await page.$('a.BaseButton--skinGreen, a.BaseButton');
    if (!submitBtn) {
      console.log(`  ❌ #${update.articleId} 수정 버튼 없음`);
      return false;
    }
    await submitBtn.click();

    try {
      await page.waitForURL(/articles\/\d+/, { timeout: 10000 });
    } catch {
      await page.waitForTimeout(3000);
    }

    console.log(`  ✅ #${update.articleId} "${update.title}" 수정 완료`);
    await saveCookiesForAccount(accountId);
    return true;
  } catch (error) {
    console.log(`  ❌ #${update.articleId} 오류: ${error instanceof Error ? error.message : error}`);
    return false;
  } finally {
    releaseAccountLock(accountId);
  }
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const writer = accounts.find((a) => a.accountId === 'akepzkthf12');
  if (!writer) throw new Error('writer akepzkthf12 없음');

  console.log(`=== 벤타쿠 ${UPDATES.length}건 수정 시작 ===\n`);

  let success = 0;
  let fail = 0;

  for (let i = 0; i < UPDATES.length; i++) {
    const update = UPDATES[i];
    console.log(`[${i + 1}/${UPDATES.length}] #${update.articleId} "${update.title}"`);

    const ok = await modifyArticle(writer.accountId, writer.password, update);
    if (ok) success++;
    else fail++;

    if (i < UPDATES.length - 1) {
      console.log(`  ⏳ ${DELAY_MS / 1000}초 대기...\n`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n=== 완료: 성공 ${success}건 / 실패 ${fail}건 ===`);
};

main()
  .then(async () => {
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('modify failed:', e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
