import mongoose from 'mongoose';

import { writePostWithAccount } from '@/features/auto-comment/batch/post-writer';
import { buildOwnKeywordPrompt } from '@/features/viral/prompts/build-own-keyword-prompt';
import { buildShortDailyPrompt } from '@/features/viral/prompts/build-short-daily-prompt';
import { buildViralPrompt } from '@/features/viral/viral-prompt';
import { parseViralResponse } from '@/features/viral/viral-parser';
import { generateViralContent } from '@/shared/api/content-api';
import { getViralContentStyleForLoginId } from '@/shared/config/user-profile';
import { incrementTodayPostCount, PublishedArticle } from '@/shared/models';
import { Account } from '@/shared/models/account';
import { Cafe } from '@/shared/models/cafe';
import { User } from '@/shared/models/user';

const LOGIN_ID = process.env.LOGIN_ID || '21lab';
const MONGODB_URI = process.env.MONGODB_URI;
const MODEL = 'gemini-3.1-pro-preview';
const GENERATE_TIMEOUT_MS = 120_000;
const MAX_GENERATE_ATTEMPTS = 2;

interface RetryItem {
  cafeId: string;
  cafeName: string;
  category: string;
  keyword: string;
  type: 'ad' | 'daily';
  accountId: string;
}

const RETRY_ITEMS: RetryItem[] = [
  {
    cafeId: '25636798',
    cafeName: '건강한노후준비',
    category: '자유게시판',
    keyword: '삼성 헬스 수면 점수 다시 보니까 오늘은 커피를 줄여야겠네요',
    type: 'daily',
    accountId: '8i2vlbym',
  },
  {
    cafeId: '25227349',
    cafeName: '건강관리소',
    category: '건강 챌린지',
    keyword: '우리아이예상키',
    type: 'ad',
    accountId: 'heavyzebra240',
  },
  {
    cafeId: '25636798',
    cafeName: '건강한노후준비',
    category: '건강상식',
    keyword: '20대 조기폐경 증상',
    type: 'ad',
    accountId: 'njmzdksm',
  },
];

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : '';
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : '';
};

const generateContentWithRetry = async (prompt: string): Promise<string> => {
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt += 1) {
    try {
      const response = await Promise.race([
        generateViralContent({
          prompt,
          model: MODEL,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('콘텐츠 생성 타임아웃')), GENERATE_TIMEOUT_MS);
        }),
      ]);

      return response.content;
    } catch (error) {
      if (attempt === MAX_GENERATE_ATTEMPTS) {
        throw error;
      }

      console.log(`[RETRY] 콘텐츠 생성 재시도 ${attempt}/${MAX_GENERATE_ATTEMPTS - 1}`);
    }
  }

  throw new Error('콘텐츠 생성 실패');
};

const buildPrompt = (item: RetryItem): string => {
  if (item.type === 'daily') {
    return buildShortDailyPrompt({
      keyword: item.keyword,
      keywordType: 'own',
    });
  }

  const contentStyle = getViralContentStyleForLoginId(LOGIN_ID);
  return contentStyle !== '정보'
    ? buildViralPrompt({ keyword: item.keyword, keywordType: 'own' }, contentStyle)
    : buildOwnKeywordPrompt({ keyword: item.keyword, keywordType: 'own' });
};

const main = async (): Promise<void> => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI missing');
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const cafes = await Cafe.find({ userId: user.userId, isActive: true }).lean();
  const cafeMap = new Map(cafes.map((cafe) => [cafe.cafeId, cafe]));

  const accounts = await Account.find({ userId: user.userId, isActive: true }).lean();
  const accountMap = new Map(accounts.map((account) => [account.accountId, account]));

  const results: Array<{
    keyword: string;
    cafeName: string;
    accountId: string;
    success: boolean;
    articleId?: number;
    articleUrl?: string;
    error?: string;
  }> = [];

  for (const item of RETRY_ITEMS) {
    const cafe = cafeMap.get(item.cafeId);
    const account = accountMap.get(item.accountId);

    if (!cafe) {
      results.push({
        keyword: item.keyword,
        cafeName: item.cafeName,
        accountId: item.accountId,
        success: false,
        error: `카페 없음: ${item.cafeId}`,
      });
      continue;
    }

    if (!account) {
      results.push({
        keyword: item.keyword,
        cafeName: item.cafeName,
        accountId: item.accountId,
        success: false,
        error: `계정 없음: ${item.accountId}`,
      });
      continue;
    }

    console.log(`[PUBLISH] ${item.cafeName} | ${item.accountId} | ${item.keyword}`);

    try {
      const prompt = buildPrompt(item);
      const content = await generateContentWithRetry(prompt);
      const parsed = parseViralResponse(content);
      const title = parsed?.title || parseTitle(content);
      const body = parsed?.body || parseBody(content);

      if (!title || !body) {
        throw new Error('생성 결과 파싱 실패');
      }

      const postResult = await writePostWithAccount(
        {
          id: account.accountId,
          password: account.password,
          nickname: account.nickname,
        },
        {
          cafeId: cafe.cafeId,
          menuId: cafe.menuId,
          subject: title,
          content: body,
          category: item.category,
        }
      );

      if (!postResult.success || !postResult.articleId) {
        throw new Error(postResult.error || '글 발행 실패');
      }

      const articleUrl =
        postResult.articleUrl ||
        `https://cafe.naver.com/ca-fe/cafes/${cafe.cafeId}/articles/${postResult.articleId}`;

      try {
        await PublishedArticle.updateOne(
          { cafeId: cafe.cafeId, articleId: postResult.articleId },
          {
            $set: {
              menuId: cafe.menuId,
              keyword: item.keyword,
              title,
              content: body,
              articleUrl,
              writerAccountId: account.accountId,
              status: 'published',
              postType: item.type,
            },
            $setOnInsert: {
              commentCount: 0,
              replyCount: 0,
              publishedAt: new Date(),
            },
          },
          { upsert: true }
        );

        await incrementTodayPostCount(account.accountId, cafe.cafeId);
      } catch (dbError) {
        console.log(
          `[PUBLISH] DB 저장 경고: ${dbError instanceof Error ? dbError.message : String(dbError)}`
        );
      }

      results.push({
        keyword: item.keyword,
        cafeName: item.cafeName,
        accountId: item.accountId,
        success: true,
        articleId: postResult.articleId,
        articleUrl,
      });

      console.log(`[PUBLISH] 성공 #${postResult.articleId} ${title}`);
    } catch (error) {
      results.push({
        keyword: item.keyword,
        cafeName: item.cafeName,
        accountId: item.accountId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`[PUBLISH] 실패 ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('');
  console.log('=== 결과 ===');
  for (const result of results) {
    if (result.success) {
      console.log(
        `OK | ${result.cafeName} | ${result.accountId} | ${result.keyword} | #${result.articleId}`
      );
      continue;
    }

    console.log(
      `FAIL | ${result.cafeName} | ${result.accountId} | ${result.keyword} | ${result.error}`
    );
  }
};

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
