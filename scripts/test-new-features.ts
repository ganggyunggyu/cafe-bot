/**
 * E2E 테스트: 글쓰기 아이디 + 댓글 아이디 전체 플로우
 * 실행: npx tsx --env-file=.env.local scripts/test-new-features.ts
 */

import mongoose from 'mongoose';
import { browseCafePosts, pickRandomArticles } from '../src/shared/lib/cafe-browser';
import { likeArticleWithAccount } from '../src/features/auto-comment/like-writer';
import { writePostWithAccount } from '../src/features/auto-comment/batch/post-writer';
import { writeCommentWithAccount } from '../src/features/auto-comment/comment-writer';
import type { NaverAccount } from '../src/shared/lib/account-manager';
import { Cafe } from '../src/shared/models/cafe';
import { Account } from '../src/shared/models/account';

const MONGODB_URI = process.env.MONGODB_URI;
const USER_ID = 'user-1768955253636'; // 강경규

if (!MONGODB_URI) {
  console.error('MONGODB_URI 환경변수 없음');
  process.exit(1);
}

const getAccount = async (accountId: string): Promise<NaverAccount> => {
  const dbAccount = await Account.findOne({ accountId, isActive: true }).lean();
  if (!dbAccount) {
    throw new Error(`계정 ${accountId} 없음`);
  }
  return {
    id: dbAccount.accountId,
    password: dbAccount.password,
    nickname: dbAccount.nickname,
  };
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  await mongoose.connect(MONGODB_URI as string);

  const cafe = await Cafe.findOne({ name: '으스스' }).lean();
  if (!cafe) throw new Error('으스스 카페 없음');
  console.log(`\n카페: ${cafe.name} (cafeId: ${cafe.cafeId}, menuId: ${cafe.menuId})`);

  const accounts = await Account.find({ userId: USER_ID, isActive: true }).lean();
  console.log(`계정 ${accounts.length}개: ${accounts.map((a) => a.accountId).join(', ')}`);

  const writerAccountId = accounts[0].accountId;
  const commenterAccountId = accounts.length > 1 ? accounts[1].accountId : accounts[0].accountId;

  const writerAccount = await getAccount(writerAccountId);
  const commenterAccount = await getAccount(commenterAccountId);

  console.log(`\n글쓰기 아이디: ${writerAccount.id}`);
  console.log(`댓글 아이디: ${commenterAccount.id}`);

  // === 테스트 1: 글쓰기 아이디 — 글 발행 ===
  console.log('\n========== 테스트 1: 글 발행 ==========');
  const postResult = await writePostWithAccount(writerAccount, {
    cafeId: cafe.cafeId,
    menuId: cafe.menuId,
    subject: `[테스트] 으스스한 애니 추천 ${Date.now().toString(36)}`,
    content: '요즘 으스스한 애니 찾고 있는데 추천 좀 해주세요~\n\n주술회전이랑 체인소맨은 이미 봤고, 비슷한 느낌의 작품 있을까요?\n\n다크판타지 장르면 더 좋겠어요!',
  });

  console.log('글 발행 결과:', {
    success: postResult.success,
    articleId: postResult.articleId,
    error: postResult.error,
  });

  if (!postResult.success || !postResult.articleId) {
    console.error('글 발행 실패 — 이후 테스트 중단');
    await mongoose.disconnect();
    process.exit(1);
  }

  await delay(3000);

  // === 테스트 2: 글쓰기 아이디 — 카페 글 탐색 ===
  console.log('\n========== 테스트 2: 카페 글 탐색 ==========');
  const browseResult = await browseCafePosts(writerAccount, cafe.cafeId, Number(cafe.menuId), {
    perPage: 10,
  });

  if (!browseResult.success) {
    console.error('카페 글 탐색 실패:', browseResult.error);
  } else {
    console.log(`글 ${browseResult.articles.length}개 발견:`);
    browseResult.articles.forEach((a, i) => {
      console.log(`  ${i + 1}. [${a.articleId}] ${a.subject} (${a.nickname})`);
    });
  }

  await delay(2000);

  // === 테스트 3: 글쓰기 아이디 — 타인 글에 좋아요 ===
  console.log('\n========== 테스트 3: 독립 좋아요 ==========');
  const otherArticles = browseResult.success
    ? browseResult.articles.filter((a) => a.articleId !== postResult.articleId)
    : [];

  if (otherArticles.length > 0) {
    const likeTarget = otherArticles[0];
    console.log(`대상: [${likeTarget.articleId}] ${likeTarget.subject}`);
    const likeResult = await likeArticleWithAccount(writerAccount, cafe.cafeId, likeTarget.articleId);
    console.log('좋아요 결과:', likeResult);
  } else {
    console.log('좋아요 대상 글 없음 (탐색 실패 또는 본인 글만 존재)');
  }

  await delay(2000);

  // === 테스트 4: 글쓰기 아이디 — 타인 글에 댓글 2개 ===
  console.log('\n========== 테스트 4: 타인 글에 댓글 ==========');
  const commentTargets = pickRandomArticles(otherArticles, 2);
  const commentContents = [
    '오 이거 괜찮네요! 저도 한번 봐야겠어요 ㅎㅎ',
    '좋은 정보 감사합니다~ 참고할게요!',
  ];

  for (let i = 0; i < commentTargets.length; i++) {
    const target = commentTargets[i];
    console.log(`댓글 ${i + 1}: [${target.articleId}] ${target.subject}`);
    const commentResult = await writeCommentWithAccount(
      writerAccount,
      cafe.cafeId,
      target.articleId,
      commentContents[i]
    );
    console.log(`  결과:`, { success: commentResult.success, error: commentResult.error });
    await delay(2000);
  }

  // === 테스트 5: 댓글 아이디 — 방금 쓴 글에 댓글 ===
  console.log('\n========== 테스트 5: 댓글 아이디 — 글에 댓글 ==========');
  console.log(`댓글 아이디: ${commenterAccount.id} → 글 [${postResult.articleId}]`);
  const commenterResult = await writeCommentWithAccount(
    commenterAccount,
    cafe.cafeId,
    postResult.articleId!,
    '와 이 글 대박이네요!! 저도 다크판타지 좋아하는데 도쿄구울 추천드려요~'
  );
  console.log('댓글 아이디 댓글 결과:', {
    success: commenterResult.success,
    error: commenterResult.error,
  });

  await delay(2000);

  // === 테스트 6: 댓글 아이디 — 좋아요 ===
  console.log('\n========== 테스트 6: 댓글 아이디 — 좋아요 ==========');
  const commenterLikeResult = await likeArticleWithAccount(
    commenterAccount,
    cafe.cafeId,
    postResult.articleId!
  );
  console.log('댓글 아이디 좋아요 결과:', commenterLikeResult);

  // === 결과 요약 ===
  console.log('\n========================================');
  console.log('============ 테스트 결과 요약 ============');
  console.log('========================================');
  console.log(`글쓰기 아이디 (${writerAccount.id}):`);
  console.log(`  글 발행: ${postResult.success ? '✅' : '❌'} articleId=${postResult.articleId}`);
  console.log(`  카페 탐색: ${browseResult.success ? '✅' : '❌'} ${browseResult.articles?.length ?? 0}개`);
  console.log(`  독립 좋아요: ${otherArticles.length > 0 ? '✅ 실행' : '⏭️ 스킵'}`);
  console.log(`  타인글 댓글: ${commentTargets.length}개 실행`);
  console.log(`댓글 아이디 (${commenterAccount.id}):`);
  console.log(`  댓글 작성: ${commenterResult.success ? '✅' : '❌'}`);
  console.log(`  좋아요: ${commenterLikeResult.success ? '✅' : '❌'}`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('테스트 오류:', err);
  process.exit(1);
});
