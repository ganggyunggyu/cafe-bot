/**
 * 카페 게시판(메뉴) 목록 스캔 및 DB 저장
 * - Playwright로 카페 직접 접속하여 게시판 목록 추출
 * - 댓글 적합 게시판만 필터링하여 commentableMenuIds에 저장
 * - 카페별 1회 실행 (이후 side activity에서 DB 값 사용)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/scan-cafe-menus.ts
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { Cafe } from '../src/shared/models/cafe';
import { fetchCafeMenuList } from '../src/shared/lib/cafe-browser';
import { closeAllContexts } from '../src/shared/lib/multi-session';
import type { NaverAccount } from '../src/shared/lib/account-manager';

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;

const CAFE_URLS: Record<string, string> = {
  '쇼핑지름신': 'shopjirmsin',
  '샤넬오픈런': 'shoppingtpw',
};

const main = async () => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const account = await Account.findOne({
    userId: user.userId,
    isActive: true,
    role: 'writer',
  }).lean();
  if (!account) throw new Error('no writer account');

  const naverAccount: NaverAccount = {
    id: account.accountId,
    password: account.password,
    nickname: account.nickname,
  };

  const cafes = await Cafe.find({ userId: user.userId, isActive: true });

  console.log(`=== 카페 게시판 스캔 시작 ===`);
  console.log(`계정: ${account.accountId}`);
  console.log(`카페: ${cafes.length}개\n`);

  for (const cafe of cafes) {
    const cafeUrl = CAFE_URLS[cafe.name];
    if (!cafeUrl) {
      console.log(`${cafe.name}: URL 매핑 없음 스킵`);
      continue;
    }

    console.log(`--- ${cafe.name} (${cafe.cafeId}) ---`);

    const result = await fetchCafeMenuList(naverAccount, cafe.cafeId, cafeUrl);

    if (!result.success) {
      console.error(`  실패: ${result.error}`);
      continue;
    }

    const menuIds = result.menus.map((m) => m.menuId);

    console.log(`  댓글 적합 게시판 ${result.menus.length}개:`);
    for (const menu of result.menus) {
      console.log(`    [${menu.menuId}] ${menu.menuName}`);
    }

    await Cafe.updateOne(
      { _id: cafe._id },
      { $set: { commentableMenuIds: menuIds } },
    );
    console.log(`  DB 저장 완료: ${menuIds.length}개 menuId\n`);
  }

  console.log('=== 완료 ===');
};

main()
  .then(async () => {
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('failed:', e);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
