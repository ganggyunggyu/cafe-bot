/**
 * Writer 5명 계정 정지 여부 확인 (headless 병렬)
 */
import { chromium, Browser } from 'playwright';
import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';

const WRITER_IDS = ['olgdmp9921'];

const checkOne = async (browser: Browser, accountId: string, password: string) => {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  try {
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.fill('input#id', accountId);
    await page.fill('input#pw', password);
    await page.click('button.btn_login, button#log\\.login');
    await page.waitForTimeout(4500);

    const url = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');

    let status = 'unknown';
    if (!url.includes('nid.naver.com') || !url.includes('nidlogin')) {
      status = '✅ 정상';
    } else if (bodyText.includes('아이디 또는 비밀번호') || bodyText.includes('잘못')) {
      status = '❌ 비밀번호오류';
    } else if (bodyText.includes('자동등록방지') || bodyText.includes('보안문자')) {
      status = '⚠️ 캡챠';
    } else if (bodyText.includes('일시적') || bodyText.includes('이용제한') || bodyText.includes('정지')) {
      status = '🚫 제한/정지';
    } else if (bodyText.includes('문자') && bodyText.includes('인증')) {
      status = '📱 OTP';
    } else {
      status = `❓ 알수없음 url=${url.slice(0, 60)}`;
    }
    console.log(`${accountId.padEnd(12)} ${status}`);
    console.log(`  → url: ${url}`);
    console.log(`  → text: ${bodyText.slice(0, 200).replace(/\s+/g, ' ')}`);
    return { accountId, status };
  } catch (e) {
    console.log(`${accountId.padEnd(12)} 💥 오류: ${e instanceof Error ? e.message.slice(0, 50) : e}`);
    return { accountId, status: 'error' };
  } finally {
    await ctx.close();
  }
};

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10000 });
  const user = await User.findOne({ loginId: '21lab', isActive: true }).lean();
  if (!user) throw new Error('user not found');
  const accounts = await Account.find({
    userId: (user as any).userId,
    accountId: { $in: WRITER_IDS },
    isActive: true,
  }).lean();

  console.log(`Writer 계정 ${accounts.length}개 순차 로그인 테스트 시작\n`);
  const browser = await chromium.launch({ headless: true });

  const results = [];
  for (const a of accounts as any[]) {
    const r = await checkOne(browser, a.accountId, a.password);
    results.push(r);
    await new Promise((res) => setTimeout(res, 10000));
  }

  await browser.close();
  await mongoose.disconnect();

  console.log('\n=== 요약 ===');
  for (const r of results) console.log(`${r.accountId}: ${r.status}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
