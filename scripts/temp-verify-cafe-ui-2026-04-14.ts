import dotenv from 'dotenv';

import { getAllAccounts } from '@/shared/config/accounts';
import { getCafeWriterAccounts } from '@/shared/config/cafe-account-policy';
import { connectDB } from '@/shared/lib/mongodb';
import { closeAllContexts } from '@/shared/lib/multi-session';
import { readCafeArticleContent } from '@/shared/lib/cafe-article-reader';
import { User } from '@/shared/models/user';

dotenv.config({ path: '.env.local' });

const LOGIN_ID = '21lab';

const TARGET_ARTICLES = [
  {
    cafeId: '25636798',
    cafeName: '건강한노후준비',
    articleId: 31123,
    expectedTitle: '수면 점수 보는 재미 쏠쏠하네요',
  },
  {
    cafeId: '25636798',
    cafeName: '건강한노후준비',
    articleId: 31124,
    expectedTitle: '40대 중반 임신 확률 검색만 하다가 마음이 더 복잡해졌어요',
  },
  {
    cafeId: '25227349',
    cafeName: '건강관리소',
    articleId: 1086,
    expectedTitle: '나이키 런클럽 켜고 걷기 페이스 보는 재미가 다시 붙었어요',
  },
  {
    cafeId: '25460974',
    cafeName: '샤넬오픈런',
    articleId: 292578,
    expectedTitle: '퇴근해야 되는데 사진만 보네요ㅎ',
  },
] as const;

const normalizeText = (value: string | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

const main = async (): Promise<void> => {
  await connectDB();

  const user = await User.findOne({ loginId: LOGIN_ID, isActive: true }).lean();
  if (!user) {
    throw new Error(`user not found: ${LOGIN_ID}`);
  }

  const accounts = await getAllAccounts(user.userId);

  for (const target of TARGET_ARTICLES) {
    const writerAccounts = getCafeWriterAccounts(accounts, target.cafeId);
    const viewerAccount = writerAccounts[0];

    if (!viewerAccount) {
      console.log(`FAIL | ${target.cafeName} #${target.articleId} | viewer account missing`);
      continue;
    }

    const result = await readCafeArticleContent(viewerAccount, target.cafeId, target.articleId);
    if (!result.success) {
      console.log(
        `FAIL | ${target.cafeName} #${target.articleId} | ${result.error || 'unknown error'} | ${result.url}`,
      );
      continue;
    }

    const title = normalizeText(result.title);
    const expectedTitle = normalizeText(target.expectedTitle);
    const titleMatches = title.includes(expectedTitle) || expectedTitle.includes(title);
    const contentLength = normalizeText(result.content).length;

    console.log(
      [
        'PASS',
        target.cafeName,
        `#${target.articleId}`,
        `titleMatch=${titleMatches ? 'Y' : 'N'}`,
        `author=${normalizeText(result.authorNickname) || '-'}`,
        `contentLength=${contentLength}`,
        `title=${title || '-'}`,
        result.url,
      ].join(' | '),
    );
  }
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[TEMP-VERIFY-CAFE-UI] ${message}`);
    process.exitCode = 1;
  } finally {
    try {
      await closeAllContexts();
    } catch {}
  }
};

void run();
