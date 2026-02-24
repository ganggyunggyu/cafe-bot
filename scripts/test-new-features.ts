/**
 * 신규 기능 테스트: 카페 글 탐색 + 독립 좋아요
 * 실행: npx tsx --env-file=.env.local scripts/test-new-features.ts
 */

import mongoose from 'mongoose';
import { browseCafePosts, pickRandomArticles } from '../src/shared/lib/cafe-browser';
import { likeArticleWithAccount } from '../src/features/auto-comment/like-writer';
import type { NaverAccount } from '../src/shared/lib/account-manager';
import { Cafe } from '../src/shared/models/cafe';
import { Account } from '../src/shared/models/account';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const getTestAccount = async (): Promise<NaverAccount> => {
  const dbAccount = await Account.findOne({ accountId: 'qwzx16', isActive: true }).lean();
  if (!dbAccount) {
    console.error('qwzx16 계정을 DB에서 찾을 수 없음');
    process.exit(1);
  }
  console.log(`계정 정보: ${dbAccount.accountId} (pw길이: ${dbAccount.password.length})`);
  return {
    id: dbAccount.accountId,
    password: dbAccount.password,
    nickname: dbAccount.nickname,
  };
};

const run = async () => {
  console.log('\n=== 신규 기능 테스트 시작 ===\n');

  // 1. MongoDB 연결 + 카페 정보 조회
  await mongoose.connect(MONGODB_URI as string);
  const cafe = await Cafe.findOne({ name: '으스스' }).lean();
  if (!cafe) {
    console.error('으스스 카페를 DB에서 찾을 수 없음');
    process.exit(1);
  }
  console.log(`카페 정보: ${cafe.name} (cafeId: ${cafe.cafeId}, menuId: ${cafe.menuId})`);

  const testAccount = await getTestAccount();

  // 2. 카페 글 탐색 테스트
  console.log('\n--- 테스트 1: 카페 글 탐색 (browseCafePosts) ---');
  const browseResult = await browseCafePosts(testAccount, cafe.cafeId, {
    perPage: 10,
  });

  if (!browseResult.success) {
    console.error('카페 글 탐색 실패:', browseResult.error);
  } else {
    console.log(`\n카페 글 ${browseResult.articles.length}개 발견:`);
    browseResult.articles.forEach((article, i) => {
      console.log(`  ${i + 1}. [${article.articleId}] ${article.subject} (작성자: ${article.nickname}, 조회: ${article.readCount}, 좋아요: ${article.likeCount})`);
    });

    // 3. 랜덤 글 선택 테스트
    const picked = pickRandomArticles(browseResult.articles, 2);
    console.log(`\n랜덤 선택 ${picked.length}개:`);
    picked.forEach((a) => console.log(`  - [${a.articleId}] ${a.subject}`));

    // 4. 독립 좋아요 테스트 (첫 번째 글에)
    if (picked.length > 0) {
      const target = picked[0];
      console.log(`\n--- 테스트 2: 독립 좋아요 (likeArticleWithAccount) ---`);
      console.log(`대상: [${target.articleId}] ${target.subject}`);

      const likeResult = await likeArticleWithAccount(testAccount, cafe.cafeId, target.articleId);
      console.log(`좋아요 결과:`, likeResult);
    }
  }

  console.log('\n=== 테스트 완료 ===');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('테스트 오류:', err);
  process.exit(1);
});
