import mongoose from 'mongoose';

import { browseCafePosts, pickRandomArticles } from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateCafeCommentWithGemini } from '../src/shared/api/gemini-comment-api';
import { Cafe } from '../src/shared/models/cafe';
import { Account } from '../src/shared/models/account';

const MONGODB_URI = process.env.MONGODB_URI;
const USER_ID = process.env.TEST_USER_ID || 'user-1768955253636';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY;

if (!MONGODB_URI) {
  console.error('MONGODB_URI 환경변수 없음');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(MONGODB_URI);

  const cafe = await Cafe.findOne({ name: '으스스', isActive: true }).lean();
  if (!cafe) {
    throw new Error('으스스 카페 없음');
  }

  const dbAccount = await Account.findOne({ userId: USER_ID, isActive: true }).lean();
  if (!dbAccount) {
    throw new Error(`활성 계정 없음 (userId=${USER_ID})`);
  }

  const account = {
    id: dbAccount.accountId,
    password: dbAccount.password,
    nickname: dbAccount.nickname,
  };

  console.log(`카페: ${cafe.name} (cafeId=${cafe.cafeId}, menuId=${cafe.menuId})`);
  console.log(`계정: ${account.id}`);

  const browse = await browseCafePosts(account, cafe.cafeId, Number(cafe.menuId), {
    perPage: 20,
  });

  if (!browse.success) {
    throw new Error(`카페 글 탐색 실패: ${browse.error}`);
  }

  if (browse.articles.length === 0) {
    throw new Error('탐색된 글 없음');
  }

  const target = pickRandomArticles(browse.articles, 1)[0];
  if (!target) {
    throw new Error('타겟 글 선택 실패');
  }

  console.log(`\n타겟: [${target.articleId}] ${target.subject}`);

  const article = await readCafeArticleContent(account, cafe.cafeId, target.articleId);
  if (!article.success || !article.content) {
    throw new Error(`글 본문 읽기 실패: ${article.error}`);
  }

  console.log(`\nURL: ${article.url}`);
  console.log(`제목: ${article.title || '(없음)'}`);
  console.log(`작성자: ${article.authorNickname || '(없음)'}`);
  console.log(`본문 일부: ${article.content.slice(0, 160).replace(/\s+/g, ' ').trim()}...`);

  if (!GEMINI_API_KEY) {
    console.log('\nGemini 키 없음: .env.local에 GEMINI_API_KEY 설정 필요');
    await mongoose.disconnect();
    process.exit(0);
  }

  const comment = await generateCafeCommentWithGemini({
    articleTitle: article.title,
    articleContent: article.content,
    authorName: article.authorNickname,
  });
  console.log(`\n생성 댓글: ${comment}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('테스트 오류:', error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error('MongoDB disconnect 실패:', disconnectError);
  }
  process.exit(1);
});
