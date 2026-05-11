import dotenv from 'dotenv';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { Account } from '../src/shared/models/account';
import {
  acquireAccountLock,
  closeAllContexts,
  getPageForAccount,
  isAccountLoggedIn,
  loginAccount,
  releaseAccountLock,
} from '../src/shared/lib/multi-session';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface AuditMatch {
  severity: 'confirmed' | 'review';
  articleId: number;
  cafeId: string;
  accountId: string;
  nickname: string;
  type: 'comment' | 'reply';
  commentId: string;
  content: string;
  suggestedContent: string;
}

interface AuditReport {
  matches: AuditMatch[];
}

interface LiveResult extends AuditMatch {
  liveStatus: 'found' | 'missing' | 'login_failed' | 'fetch_failed' | 'account_missing';
  liveCommentId: string;
  liveNickname: string;
  liveContent: string;
  error: string;
}

const getArgValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
};

const normalize = (value: string): string => {
  return value.replace(/\s+/g, '').replace(/[.,…~ㅋㅎㅠㅜ]/g, '').trim();
};

const fetchComments = async (
  accountId: string,
  cafeId: string,
  articleId: number
): Promise<{ success: true; items: any[] } | { success: false; error: string }> => {
  const account = await Account.findOne({ accountId, isActive: true }).lean();
  if (!account) return { success: false, error: 'account_missing' };

  await acquireAccountLock(accountId);
  try {
    const loggedIn = await isAccountLoggedIn(accountId);
    if (!loggedIn) {
      const loginResult = await loginAccount(accountId, account.password);
      if (!loginResult.success) {
        return { success: false, error: `login_failed:${loginResult.error ?? ''}` };
      }
    }

    const page = await getPageForAccount(accountId);
    await page.goto(`https://cafe.naver.com/ca-fe/cafes/${cafeId}/articles/${articleId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2500);

    const data = await page.evaluate(async (args: { cafeId: string; articleId: number }) => {
      const url = `https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes/${args.cafeId}/articles/${args.articleId}/comments/pages/1?orderBy=asc&pageSize=100&requestFrom=A`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        return { ok: false, error: `${response.status}` };
      }
      return { ok: true, json: await response.json() };
    }, { cafeId, articleId });

    if (!data.ok) {
      return { success: false, error: `fetch_failed:${data.error}` };
    }

    return { success: true, items: data.json?.result?.comments?.items ?? [] };
  } finally {
    releaseAccountLock(accountId);
  }
};

const verifyMatch = async (match: AuditMatch): Promise<LiveResult> => {
  const fetched = await fetchComments(match.accountId, match.cafeId, match.articleId);
  if (!fetched.success) {
    const status = fetched.error.startsWith('login_failed')
      ? 'login_failed'
      : fetched.error.startsWith('fetch_failed')
        ? 'fetch_failed'
        : 'account_missing';

    return {
      ...match,
      liveStatus: status,
      liveCommentId: '',
      liveNickname: '',
      liveContent: '',
      error: fetched.error,
    };
  }

  const targetContent = normalize(match.content);
  const found = fetched.items.find((item) => {
    const itemId = String(item.commentId ?? item.id ?? '');
    const content = normalize(String(item.content ?? ''));
    if (match.commentId && itemId === match.commentId) return true;
    return content.includes(targetContent.slice(0, 40)) || targetContent.includes(content.slice(0, 40));
  });

  if (!found) {
    return {
      ...match,
      liveStatus: 'missing',
      liveCommentId: '',
      liveNickname: '',
      liveContent: '',
      error: '',
    };
  }

  return {
    ...match,
    liveStatus: 'found',
    liveCommentId: String(found.commentId ?? found.id ?? ''),
    liveNickname: String(found.writer?.nick ?? ''),
    liveContent: String(found.content ?? ''),
    error: '',
  };
};

const main = async (): Promise<void> => {
  const reportPath = getArgValue('--report');
  if (!reportPath) {
    throw new Error('사용법: npx tsx --env-file=.env.local scripts/verify-banmal-comments-live.ts --report reports/파일.json');
  }

  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) throw new Error('MONGODB_URI가 필요합니다.');

  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 10000 });

  const raw = await readFile(reportPath, 'utf8');
  const report = JSON.parse(raw) as AuditReport;
  const results: LiveResult[] = [];

  for (const match of report.matches) {
    const result = await verifyMatch(match);
    results.push(result);
    console.log(`[${result.liveStatus}] ${match.severity} cafe=${match.cafeId} article=${match.articleId} acc=${match.accountId} "${match.content.slice(0, 40)}"`);
  }

  const outputPath = reportPath.replace(/\.json$/u, '.live.json');
  await writeFile(outputPath, JSON.stringify({ sourceReport: path.resolve(reportPath), total: results.length, found: results.filter((result) => result.liveStatus === 'found').length, results }, null, 2));

  console.log(`LIVE: ${outputPath}`);

  await closeAllContexts();
  await mongoose.disconnect();
};

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    try { await closeAllContexts(); } catch {}
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
