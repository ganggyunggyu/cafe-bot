import { writeFileSync } from 'fs';
import { resolve } from 'path';
import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import { PublishedArticle, addCommentToArticle } from '../src/shared/models/published-article';
import { User } from '../src/shared/models/user';
import {
  writeCommentWithAccount,
  writeReplyWithAccount,
} from '../src/features/auto-comment/comment-writer';
import type { NaverAccount } from '../src/shared/lib/account-manager';

const CAFE_ID = '25636798';
const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const TARGET_COMMENT_COUNT = Math.max(1, Number(process.env.TARGET_COMMENT_COUNT || 4));
const TARGET_REPLY_COUNT = Math.max(0, Number(process.env.TARGET_REPLY_COUNT || 2));
const ACTION_DELAY_MS = Math.max(0, Number(process.env.ACTION_DELAY_MS || 2000));
const OUTPUT_PATH = resolve(
  process.cwd(),
  'outputs/health-comment-fill-2026-06-18-freemapleafreecabj.json'
);

type AccountDoc = {
  accountId: string;
  password: string;
  nickname?: string;
  role?: string;
};

type CommentRecord = {
  accountId: string;
  nickname?: string;
  content: string;
  type: 'comment' | 'reply';
  commentId?: string;
  commentIndex?: number;
  parentIndex?: number;
};

type TargetPlan = {
  articleId: number;
  comments: string[];
  replies: string[];
};

type ActionResult = {
  articleId: number;
  type: 'comment' | 'reply';
  accountId?: string;
  parentIndex?: number;
  commentId?: string;
  content: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
};

const TARGETS: TargetPlan[] = [
  {
    articleId: 32123,
    comments: [
      '저도 손끝이 찌릿할 때가 있어서 이런 글 보면 자세부터 다시 보게 되네요.',
      '혈액순환 쪽만 생각했는데 목이나 손목 문제도 같이 볼 수 있겠어요.',
      '밤에 더 심한 편이면 진짜 불편하더라고요. 체크할 부분 정리돼서 좋네요.',
      '손을 많이 쓰는 날에는 더 느껴져서 공감하면서 읽었습니다.',
    ],
    replies: [
      '맞아요, 손목만 볼 게 아니라 자세까지 같이 봐야겠더라고요.',
      '저도 밤에 심해지는 경우가 있어서 기록해두는 게 도움 됐어요.',
    ],
  },
  {
    articleId: 32122,
    comments: [
      '호르몬주사는 시작 전부터 걱정이 많아지는 것 같아요. 경험담 참고가 되네요.',
      '컨디션 변화를 메모해두면 병원 상담할 때 확실히 말하기 편하더라고요.',
      '주사 일정이랑 몸 상태가 같이 흔들릴 수 있어서 마음 준비도 필요한 것 같아요.',
      '처음이면 더 고민되죠. 그래도 기준 잡고 보면 덜 불안할 것 같아요.',
    ],
    replies: [
      '기록해두는 거 정말 공감해요. 나중에 설명할 때 차이가 크더라고요.',
      '처음 주사 전에는 작은 증상도 신경 쓰여서 더 조심하게 되는 것 같아요.',
    ],
  },
  {
    articleId: 32121,
    comments: [
      '프로게스테론은 형태가 여러 가지라 챙기는 방식도 헷갈리더라고요.',
      '시간 맞추는 게 은근 어렵던데 정리해두면 덜 놓칠 것 같아요.',
      '저도 이런 내용은 한 번에 보기 좋게 정리된 글이 제일 도움 되더라고요.',
      '병원마다 안내가 조금씩 달라서 기본 개념 알아두는 게 필요한 것 같아요.',
    ],
    replies: [
      '맞아요, 시간 맞추는 게 생각보다 제일 신경 쓰이더라고요.',
      '형태별로 다르게 느끼는 분들도 있어서 비교해보면 좋겠어요.',
    ],
  },
  {
    articleId: 32120,
    comments: [
      '여주발효효소는 맛이랑 속 편한지가 제일 궁금했는데 한 달 후기라 좋네요.',
      '꾸준히 먹어본 후기는 확실히 참고하기 편한 것 같아요.',
      '혈당 쪽 관심 있는 분들은 성분이랑 섭취감 같이 보게 되더라고요.',
      '이런 건 처음 며칠보다 한 달 정도 먹어본 느낌이 더 궁금했어요.',
    ],
    replies: [
      '저도 맛이 제일 궁금했어요. 꾸준히 먹을 수 있는지가 중요하더라고요.',
      '후기 기간이 길면 확실히 더 믿고 참고하게 되는 것 같아요.',
    ],
  },
  {
    articleId: 32117,
    comments: [
      '수족냉증은 손발만 문제가 아니라 생활습관까지 같이 봐야 하더라고요.',
      '저도 겨울 아니어도 손이 차서 공감돼요. 따뜻하게 유지하는 게 쉽지 않네요.',
      '혈액순환 관리랑 스트레칭도 같이 챙겨야겠다는 생각이 들어요.',
      '발끝 차가운 건 잠잘 때도 불편해서 이런 정보가 도움 됩니다.',
    ],
    replies: [
      '맞아요, 겨울만 문제가 아니라 사계절 신경 쓰이더라고요.',
      '스트레칭이나 반신욕처럼 꾸준히 할 수 있는 관리가 중요해 보여요.',
    ],
  },
  {
    articleId: 32108,
    comments: [
      '건강기능식품은 종류가 너무 많아서 기준 없이 고르면 헷갈리더라고요.',
      '성분표랑 섭취 목적을 먼저 보는 게 중요하다는 말에 공감합니다.',
      '광고 문구보다 나한테 필요한지 확인하는 게 먼저인 것 같아요.',
      '중복 섭취도 은근 놓치기 쉬워서 정리해두면 좋겠네요.',
    ],
    replies: [
      '중복 섭취 부분 진짜 공감돼요. 같은 성분 들어간 제품이 많더라고요.',
      '목적을 먼저 정하면 제품 고르는 시간이 줄어드는 것 같아요.',
    ],
  },
  {
    articleId: 32105,
    comments: [
      '이식 후에는 평소 하던 것도 괜히 조심스러워져서 기준이 있으면 좋더라고요.',
      '무리하지 않는 선을 잡는 게 제일 어려운 것 같아요. 정리 감사합니다.',
      '일상생활을 어디까지 해도 되는지 궁금한 분들한테 도움 되겠네요.',
      '몸 컨디션을 보면서 움직이라는 말이 현실적으로 와닿아요.',
    ],
    replies: [
      '맞아요, 무리하지 않는 선을 잡는 게 생각보다 어렵더라고요.',
      '컨디션 기록해두면 병원에 물어볼 때도 도움이 될 것 같아요.',
    ],
  },
  {
    articleId: 32104,
    comments: [
      '악성빈혈은 이름부터 무겁게 느껴져서 증상 정리가 필요하겠더라고요.',
      '그냥 피곤한 걸로 넘기기 쉬운 부분이라 더 조심해서 봐야겠네요.',
      '원인까지 같이 봐야 한다는 점이 중요한 것 같아요. 참고했습니다.',
      '검사나 상담이 필요한 경우를 구분하는 게 제일 헷갈렸는데 도움 되네요.',
    ],
    replies: [
      '맞아요, 피곤함으로만 넘기면 놓치기 쉬운 부분이 있는 것 같아요.',
      '증상만 보지 말고 원인까지 같이 확인해야 한다는 말이 기억에 남네요.',
    ],
  },
];

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
};

const parseArticleIds = (): Set<number> | null => {
  const raw = (process.env.ARTICLE_IDS || '').trim();
  if (!raw) return null;

  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id));

  return new Set(ids);
};

const toNaverAccount = (account: AccountDoc): NaverAccount => ({
  id: account.accountId,
  password: account.password,
  nickname: account.nickname,
  role: account.role === 'commenter' || account.role === 'writer' ? account.role : undefined,
});

const pickAccount = (
  accounts: AccountDoc[],
  blockedIds: Set<string>,
  offset: number
): AccountDoc | null => {
  const candidates = accounts.filter(({ accountId }) => !blockedIds.has(accountId));
  if (candidates.length === 0) return null;
  return candidates[offset % candidates.length];
};

const writeOutput = (results: ActionResult[]): void => {
  const payload = {
    cafeId: CAFE_ID,
    targetCommentCount: TARGET_COMMENT_COUNT,
    targetReplyCount: TARGET_REPLY_COUNT,
    attempted: results.filter((item) => !item.skipped).length,
    succeeded: results.filter((item) => item.success && !item.skipped).length,
    failed: results.filter((item) => !item.success && !item.skipped).length,
    skipped: results.filter((item) => item.skipped).length,
    results,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const getMainComments = (comments: CommentRecord[]): CommentRecord[] => {
  return comments.filter(({ type }) => type === 'comment');
};

const getReplies = (comments: CommentRecord[]): CommentRecord[] => {
  return comments.filter(({ type }) => type === 'reply');
};

const main = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI missing');

  const articleFilter = parseArticleIds();
  const targets = articleFilter
    ? TARGETS.filter(({ articleId }) => articleFilter.has(articleId))
    : TARGETS;

  if (targets.length === 0) throw new Error('no targets after ARTICLE_IDS filter');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) throw new Error(`user not found: ${LOGIN_ID}`);

  const accounts = await Account.find({
    userId: user.userId,
    isActive: true,
    role: 'writer',
  })
    .sort({ createdAt: 1 })
    .lean();

  if (accounts.length < 3) throw new Error(`writer accounts are not enough: ${accounts.length}`);

  const results: ActionResult[] = [];

  console.log('=== HEALTH COMMENT FILL RUN ===');
  console.log(`cafeId: ${CAFE_ID}`);
  console.log(`targets: ${targets.map(({ articleId }) => articleId).join(', ')}`);
  console.log(`goal: comments=${TARGET_COMMENT_COUNT}, replies=${TARGET_REPLY_COUNT} per article`);
  console.log(`output: ${OUTPUT_PATH}`);

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
    const target = targets[targetIndex];
    const article = await PublishedArticle.findOne(
      { cafeId: CAFE_ID, articleId: target.articleId },
      {
        articleId: 1,
        title: 1,
        writerAccountId: 1,
        commentCount: 1,
        replyCount: 1,
        comments: 1,
      }
    ).lean();

    if (!article) {
      const result: ActionResult = {
        articleId: target.articleId,
        type: 'comment',
        content: '',
        success: false,
        error: 'DB article not found',
      };
      results.push(result);
      writeOutput(results);
      continue;
    }

    const writerAccountId = article.writerAccountId || '';
    let comments = ((article.comments || []) as CommentRecord[]).filter(({ content }) =>
      Boolean(content?.trim())
    );
    let mainComments = getMainComments(comments);
    let replies = getReplies(comments);

    console.log(
      `#${target.articleId} "${article.title}" start comments=${mainComments.length}, replies=${replies.length}, writer=${writerAccountId || '-'}`
    );

    let commentPlanIndex = 0;
    while (mainComments.length < TARGET_COMMENT_COUNT) {
      const content = target.comments[commentPlanIndex % target.comments.length];
      commentPlanIndex += 1;

      if (mainComments.some((comment) => comment.content === content)) {
        const result: ActionResult = {
          articleId: target.articleId,
          type: 'comment',
          content,
          success: true,
          skipped: true,
        };
        results.push(result);
        writeOutput(results);
        continue;
      }

      const usedOnArticle = new Set(mainComments.map(({ accountId }) => accountId));
      const account = pickAccount(
        accounts,
        new Set([writerAccountId, ...usedOnArticle].filter(Boolean)),
        targetIndex + commentPlanIndex
      );

      if (!account) {
        const result: ActionResult = {
          articleId: target.articleId,
          type: 'comment',
          content,
          success: false,
          error: 'No comment account available',
        };
        results.push(result);
        writeOutput(results);
        break;
      }

      console.log(
        `  [comment ${mainComments.length + 1}/${TARGET_COMMENT_COUNT}] ${account.accountId}: ${content.slice(0, 34)}`
      );

      const writeResult = await writeCommentWithAccount(
        toNaverAccount(account),
        CAFE_ID,
        target.articleId,
        content
      );

      if (!writeResult.success) {
        const result: ActionResult = {
          articleId: target.articleId,
          type: 'comment',
          accountId: account.accountId,
          content,
          success: false,
          error: writeResult.error || 'comment write failed',
        };
        results.push(result);
        console.log(`    ❌ ${result.error}`);
        writeOutput(results);
        if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
        break;
      }

      await addCommentToArticle(CAFE_ID, target.articleId, {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'comment',
        commentId: writeResult.commentId,
        commentIndex: mainComments.length,
      });

      const record: CommentRecord = {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'comment',
        commentId: writeResult.commentId,
        commentIndex: mainComments.length,
      };

      comments = [...comments, record];
      mainComments = getMainComments(comments);

      const result: ActionResult = {
        articleId: target.articleId,
        type: 'comment',
        accountId: account.accountId,
        content,
        success: true,
        commentId: writeResult.commentId,
      };
      results.push(result);
      console.log(`    ✅ commentId=${writeResult.commentId || '-'}`);
      writeOutput(results);

      if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
    }

    let replyPlanIndex = 0;
    while (replies.length < TARGET_REPLY_COUNT && mainComments.length > 0) {
      const parentIndex = replyPlanIndex % mainComments.length;
      const parent = mainComments[parentIndex];
      const content = target.replies[replyPlanIndex % target.replies.length];
      replyPlanIndex += 1;

      if (replies.some((reply) => reply.content === content)) {
        const result: ActionResult = {
          articleId: target.articleId,
          type: 'reply',
          parentIndex,
          content,
          success: true,
          skipped: true,
        };
        results.push(result);
        writeOutput(results);
        continue;
      }

      const account = pickAccount(
        accounts,
        new Set([writerAccountId, parent.accountId].filter(Boolean)),
        targetIndex + replyPlanIndex + 3
      );

      if (!account) {
        const result: ActionResult = {
          articleId: target.articleId,
          type: 'reply',
          parentIndex,
          content,
          success: false,
          error: 'No reply account available',
        };
        results.push(result);
        writeOutput(results);
        break;
      }

      console.log(
        `  [reply ${replies.length + 1}/${TARGET_REPLY_COUNT}] ${account.accountId} -> parent ${parentIndex}: ${content.slice(0, 34)}`
      );

      const writeResult = await writeReplyWithAccount(
        toNaverAccount(account),
        CAFE_ID,
        target.articleId,
        content,
        parentIndex,
        {
          parentCommentId: parent.commentId,
          parentComment: parent.content,
          parentNickname: parent.nickname || parent.accountId,
        }
      );

      if (!writeResult.success) {
        const result: ActionResult = {
          articleId: target.articleId,
          type: 'reply',
          accountId: account.accountId,
          parentIndex,
          content,
          success: false,
          error: writeResult.error || 'reply write failed',
        };
        results.push(result);
        console.log(`    ❌ ${result.error}`);
        writeOutput(results);
        if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
        break;
      }

      await addCommentToArticle(CAFE_ID, target.articleId, {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'reply',
        parentIndex,
      });

      const record: CommentRecord = {
        accountId: account.accountId,
        nickname: account.nickname || account.accountId,
        content,
        type: 'reply',
        parentIndex,
      };

      comments = [...comments, record];
      replies = getReplies(comments);

      const result: ActionResult = {
        articleId: target.articleId,
        type: 'reply',
        accountId: account.accountId,
        parentIndex,
        content,
        success: true,
      };
      results.push(result);
      console.log('    ✅ reply registered');
      writeOutput(results);

      if (ACTION_DELAY_MS > 0) await sleep(ACTION_DELAY_MS);
    }
  }

  const success = results.filter((result) => result.success && !result.skipped).length;
  const failed = results.filter((result) => !result.success && !result.skipped).length;
  const skipped = results.filter((result) => result.skipped).length;
  console.log(`=== DONE: success ${success}, skipped ${skipped}, failed ${failed} ===`);
};

main()
  .then(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('fill-health-comments failed:', error);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(1);
  });
