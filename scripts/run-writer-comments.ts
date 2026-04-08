/**
 * Writer 계정 댓글 작성 스크립트
 *
 * 지정된 카페의 타인 글에 writer 계정으로 댓글 작성
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-writer-comments.ts
 */

import mongoose from "mongoose";
import { User } from "../src/shared/models/user";
import { Account } from "../src/shared/models/account";
import { addTaskJob } from "../src/shared/lib/queue";
import {
  browseCafePosts,
  pickRandomArticles,
} from "../src/shared/lib/cafe-browser";
import { readCafeArticleContent } from "../src/shared/lib/cafe-article-reader";
import { generateComment } from "../src/shared/api/comment-gen-api";
import type { CommentJobData } from "../src/shared/lib/queue/types";
import type { NaverAccount } from "../src/shared/lib/account-manager";

const MONGODB_URI = process.env.MONGODB_URI!;
const LOGIN_ID = process.env.LOGIN_ID || "21lab";

interface CafeTarget {
  name: string;
  cafeId: string;
  commentsPerAccount: number;
}

const WRITER_IDS = [
  "4giccokx",
  "olgdmp9921",
  "uqgidh2690",
  "eytkgy5500",
  "yenalk",
];

const ACCOUNT_CAFE_MAP: Record<string, CafeTarget> = {
  "4giccokx": { name: "쇼핑지름신", cafeId: "25729954", commentsPerAccount: 20 },
  "olgdmp9921": { name: "샤넬오픈런", cafeId: "25460974", commentsPerAccount: 20 },
  "uqgidh2690": { name: "건강한노후준비", cafeId: "25636798", commentsPerAccount: 20 },
  "eytkgy5500": { name: "건강관리소", cafeId: "25227349", commentsPerAccount: 20 },
  "yenalk": { name: "쇼핑지름신", cafeId: "25729954", commentsPerAccount: 20 },
};

const TARGETS: CafeTarget[] = [
  { name: "쇼핑지름신", cafeId: "25729954", commentsPerAccount: 20 },
  { name: "샤넬오픈런", cafeId: "25460974", commentsPerAccount: 20 },
  { name: "건강한노후준비", cafeId: "25636798", commentsPerAccount: 20 },
  { name: "건강관리소", cafeId: "25227349", commentsPerAccount: 20 },
];

const BETWEEN_COMMENTS_MS = 60 * 1000;

const FALLBACK_COMMENTS = [
  "좋은 정보 감사합니다. 참고해볼게요.",
  "저도 비슷하게 느꼈는데 정리 잘해주셨네요.",
  "경험 공유 감사합니다. 도움이 됐어요.",
  "내용이 깔끔해서 이해하기 편했어요.",
  "실사용 관점에서 도움 되는 글이네요.",
];

const main = async (): Promise<void> => {
  if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
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

  const writerAccounts: NaverAccount[] = accounts
    .filter((a) => WRITER_IDS.includes(a.accountId))
    .map((a) => ({
      id: a.accountId,
      password: a.password,
      nickname: a.nickname,
    }));

  if (writerAccounts.length === 0) throw new Error("writer 계정 없음");

  const writerNicknames = new Set(writerAccounts.map((w) => w.nickname));

  console.log(`=== Writer 댓글 작성 ===`);
  console.log(
    `계정: ${writerAccounts.map((w) => w.id).join(", ")}\n`,
  );

  let totalComments = 0;

  // 계정별 딜레이 추적 (병렬 처리)
  const accountDelay = new Map<string, number>();
  for (const id of WRITER_IDS) accountDelay.set(id, 10 * 1000);

  // 먼저 모든 카페 글 목록 수집
  const cafeArticles = new Map<string, typeof browse.articles>();
  let browse: Awaited<ReturnType<typeof browseCafePosts>>;

  for (const target of TARGETS) {
    console.log(`--- ${target.name} (${target.cafeId}) ---`);

    browse = await browseCafePosts(
      writerAccounts[0],
      target.cafeId,
      undefined,
      { perPage: 50 },
    );

    if (!browse.success || browse.articles.length === 0) {
      console.log(`  글 없음 - 스킵`);
      continue;
    }

    const otherPosts = browse.articles.filter(
      (a) => !writerNicknames.has(a.nickname),
    );
    const pool = otherPosts.length > 0 ? otherPosts : browse.articles;
    console.log(
      `  전체 ${browse.articles.length}개 / 타인 글 ${otherPosts.length}개`,
    );
    cafeArticles.set(target.cafeId, pool);
  }

  // 각 계정별로 지정 카페에 댓글 생성 + 큐 추가
  for (const writer of writerAccounts) {
    const target = ACCOUNT_CAFE_MAP[writer.id];
    if (!target) continue;
    {
      const pool = cafeArticles.get(target.cafeId);
      if (!pool || pool.length === 0) continue;

      const selected = pickRandomArticles(pool, target.commentsPerAccount);

      for (let i = 0; i < selected.length; i++) {
        const article = selected[i];
        const fallback =
          FALLBACK_COMMENTS[(totalComments + i) % FALLBACK_COMMENTS.length];

        let commentText = fallback;
        try {
          const content = await readCafeArticleContent(
            writer,
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
        } catch {}

        const delay = accountDelay.get(writer.id) || 10000;
        const jobData: CommentJobData = {
          type: "comment",
          accountId: writer.id,
          cafeId: target.cafeId,
          articleId: article.articleId,
          content: commentText,
        };

        await addTaskJob(writer.id, jobData, delay);
        totalComments++;
        console.log(
          `  [${totalComments}] ${writer.id} → ${target.name} #${article.articleId} "${commentText.slice(0, 30)}..." (${Math.round(delay / 60000)}분 후)`,
        );
        accountDelay.set(writer.id, delay + BETWEEN_COMMENTS_MS);
      }
    }
  }

  console.log(`\n=== 완료: ${totalComments}개 댓글 큐 추가 ===`);
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("run-writer-comments failed:", e);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
