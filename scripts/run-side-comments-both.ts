/**
 * 5개 commenter 계정으로 쇼핑지름신 + 샤넬오픈런 카페에 댓글 작성
 *
 * 한 계정 당 쇼핑 20개 + 샤넬 20개 = 40개, 총 200개
 * 페르소나: 20~40대 여성, 쇼핑/샤넬 관심, 다양한 말투/길이
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-side-comments-both.ts
 */

import mongoose from 'mongoose';
import { User } from '../src/shared/models/user';
import { Account } from '../src/shared/models/account';
import { addTaskJob } from '../src/shared/lib/queue';
import {
  browseCafePosts,
  pickRandomArticles,
  fetchCafeMenuList,
} from '../src/shared/lib/cafe-browser';
import { readCafeArticleContent } from '../src/shared/lib/cafe-article-reader';
import { generateComment } from '../src/shared/api/comment-gen-api';
import type { CommentJobData } from '../src/shared/lib/queue/types';
import type { NaverAccount } from '../src/shared/lib/account-manager';

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || '21lab';

const ACCOUNT_IDS = [
  '4giccokx',
  'olgdmp9921',
  'uqgidh2690',
  'eytkgy5500',
  'yenalk',
];

interface CafeTarget {
  name: string;
  cafeId: string;
  cafeUrl: string;
  commentsPerAccount: number;
}

const TARGETS: CafeTarget[] = [
  { name: '쇼핑지름신', cafeId: '25729954', cafeUrl: 'shopjirmsin', commentsPerAccount: 20 },
  { name: '샤넬오픈런', cafeId: '25460974', cafeUrl: 'chanelopenrun', commentsPerAccount: 20 },
];

const BETWEEN_COMMENTS_MS = 60 * 1000;

const FALLBACK_COMMENTS = [
  '와 이거 진짜 좋아보여요!! 저도 관심 있었는데 후기 감사합니다~',
  '오 가격대비 괜찮네요 ㅎㅎ 참고할게요!',
  '저도 요즘 이런거 찾고 있었는데 좋은 정보 감사해요~',
  '헉 너무 예쁘다.. 저도 사고 싶어지네요 ㅠㅠ',
  '좋은 후기네요! 도움 많이 됐어요 감사합니다 :)',
  '이거 실물로 보면 더 예쁠것같아요~',
  '오 디테일한 후기 감사합니다!! 참고할게요 ㅎㅎ',
  '가성비 좋아보이네요! 저도 한번 알아봐야겠다',
  '요즘 이런 스타일 인기 많더라구요~ 좋은 정보 감사!',
  '우와 실사용 후기 너무 도움돼요!! 감사합니다 ㅎㅎ',
];

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({
    loginId: LOGIN_ID,
    isActive: true,
  }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
  }).lean();

  const commenterAccounts: NaverAccount[] = accounts
    .filter((a) => ACCOUNT_IDS.includes(a.accountId))
    .map((a) => ({
      id: a.accountId,
      password: a.password,
      nickname: a.nickname,
    }));

  if (commenterAccounts.length === 0) throw new Error('계정 없음');

  const commenterNicknames = new Set(commenterAccounts.map((w) => w.nickname));

  console.log(`=== 사이드 댓글 작성 (쇼핑지름신 + 샤넬오픈런) ===`);
  console.log(`계정: ${commenterAccounts.map((w) => `${w.id}(${w.nickname})`).join(', ')}`);
  console.log(`카페: ${TARGETS.map((t) => t.name).join(', ')}`);
  console.log(`총 댓글: ${commenterAccounts.length} × ${TARGETS.length} × ${TARGETS[0].commentsPerAccount} = ${commenterAccounts.length * TARGETS.length * TARGETS[0].commentsPerAccount}개\n`);

  let totalComments = 0;
  const accountDelay = new Map<string, number>();
  for (const id of ACCOUNT_IDS) accountDelay.set(id, 10 * 1000);

  // 각 카페별 다양한 메뉴/게시판에서 글 수집
  const cafeArticles = new Map<string, Awaited<ReturnType<typeof browseCafePosts>>['articles']>();

  for (const target of TARGETS) {
    console.log(`\n--- ${target.name} (${target.cafeId}) 글 수집 ---`);

    // 먼저 메뉴 목록 가져오기
    const menuResult = await fetchCafeMenuList(
      commenterAccounts[0],
      target.cafeId,
      target.cafeUrl,
    );

    let allArticles: Awaited<ReturnType<typeof browseCafePosts>>['articles'] = [];

    if (menuResult.success && menuResult.menus.length > 0) {
      console.log(`  메뉴 ${menuResult.menus.length}개 발견: ${menuResult.menus.map((m) => m.menuName).join(', ')}`);

      // 다양한 메뉴에서 글 수집 (최대 5개 메뉴)
      const menusToFetch = menuResult.menus.slice(0, 5);
      for (const menu of menusToFetch) {
        const browse = await browseCafePosts(
          commenterAccounts[0],
          target.cafeId,
          menu.menuId,
          { perPage: 30, cafeUrl: target.cafeUrl },
        );
        if (browse.success) {
          const otherPosts = browse.articles.filter(
            (a) => !commenterNicknames.has(a.nickname),
          );
          allArticles.push(...(otherPosts.length > 0 ? otherPosts : browse.articles));
          console.log(`  [${menu.menuName}] ${browse.articles.length}개 → 타인 글 ${otherPosts.length}개`);
        }
      }
    }

    // 메뉴별 수집이 부족하면 전체 최신글도 추가
    if (allArticles.length < 50) {
      const browse = await browseCafePosts(
        commenterAccounts[0],
        target.cafeId,
        undefined,
        { perPage: 50, cafeUrl: target.cafeUrl },
      );
      if (browse.success) {
        const otherPosts = browse.articles.filter(
          (a) => !commenterNicknames.has(a.nickname),
        );
        const newPosts = (otherPosts.length > 0 ? otherPosts : browse.articles)
          .filter((a) => !allArticles.some((e) => e.articleId === a.articleId));
        allArticles.push(...newPosts);
        console.log(`  [전체] 추가 ${newPosts.length}개`);
      }
    }

    // 중복 제거
    const unique = new Map<number, typeof allArticles[0]>();
    for (const a of allArticles) unique.set(a.articleId, a);
    allArticles = Array.from(unique.values());

    console.log(`  총 ${allArticles.length}개 글 수집 완료`);
    cafeArticles.set(target.cafeId, allArticles);
  }

  // 계정별로 각 카페에 댓글 큐 추가
  for (const commenter of commenterAccounts) {
    for (const target of TARGETS) {
      const pool = cafeArticles.get(target.cafeId);
      if (!pool || pool.length === 0) {
        console.log(`  [SKIP] ${commenter.id} → ${target.name}: 글 없음`);
        continue;
      }

      const selected = pickRandomArticles(pool, target.commentsPerAccount);

      console.log(`\n--- ${commenter.id}(${commenter.nickname}) → ${target.name} ${selected.length}개 ---`);

      for (let i = 0; i < selected.length; i++) {
        const article = selected[i];
        const fallback = FALLBACK_COMMENTS[(totalComments + i) % FALLBACK_COMMENTS.length];

        let commentText = fallback;
        try {
          const content = await readCafeArticleContent(
            commenter,
            target.cafeId,
            article.articleId,
          );
          if (content.success && content.content) {
            const postContext = content.title
              ? `${content.title}\n\n${content.content}`
              : content.content;
            const generated = await generateComment(
              postContext,
              null,
              content.authorNickname,
            );
            if (generated.trim()) commentText = generated.trim();
          }
        } catch {
          // fallback 사용
        }

        const delay = accountDelay.get(commenter.id) || 10000;
        const jobData: CommentJobData = {
          type: 'comment',
          accountId: commenter.id,
          cafeId: target.cafeId,
          articleId: article.articleId,
          content: commentText,
        };

        await addTaskJob(commenter.id, jobData, delay);
        totalComments++;
        console.log(
          `  [${totalComments}] ${commenter.id} → ${target.name} #${article.articleId} "${commentText.slice(0, 40)}..." (${Math.round(delay / 60000)}분 후)`,
        );

        accountDelay.set(
          commenter.id,
          delay + BETWEEN_COMMENTS_MS + Math.random() * 30 * 1000,
        );
      }
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`총 ${totalComments}개 댓글 큐 등록`);

  const maxDelay = Math.max(...Array.from(accountDelay.values()));
  const etaMin = Math.ceil(maxDelay / 60000);
  console.log(`예상 마감: ~${etaMin}분 후 (약 ${new Date(Date.now() + maxDelay).toLocaleTimeString('ko-KR')})`);

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
