import { google } from 'googleapis';
import fs from 'fs';
import mongoose from 'mongoose';
import { buildOwnKeywordPrompt } from '../src/features/viral/prompts/build-own-keyword-prompt';
import { generateViralContent } from '../src/shared/api/content-api';
import { parseViralResponse } from '../src/features/viral/viral-parser';

const SHEET_ID = '1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms';
const TARGET_GID = 1485226539;
const MODEL = process.env.SCHEDULE_MODEL || 'deepseek-v4-flash';

const KEYWORDS = [
  '시아버지생신선물',
  '50대아빠생일선물',
  '기력회복한약',
  '면역력높이는방법',
  '수족냉증 선물',
];

const loadEnvFallback = (): Record<string, string> => {
  const envVars: Record<string, string> = {};
  if (!fs.existsSync('.env')) return envVars;

  const envContent = fs.readFileSync('.env', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }

  return envVars;
};

const parseTitle = (text: string): string => {
  const match = text.match(/\[제목\]\s*\n?([\s\S]*?)(?=\n\[본문\]|\[본문\])/);
  return match ? match[1].trim() : '';
};

const parseBody = (text: string): string => {
  const match = text.match(/\[본문\]\s*\n?([\s\S]*?)(?=\n\[댓글\]|\[댓글\]|$)/);
  return match ? match[1].trim() : '';
};

const parseComments = (text: string): string => {
  const match = text.match(/\[댓글\]\s*\n?([\s\S]*?)$/);
  return match ? match[1].trim() : '';
};

const extractAngle = (prompt: string): string => {
  const line = prompt.split('\n').find((item) => item.includes('콘텐츠 앵글:'));
  return line?.match(/콘텐츠 앵글:\s*(.+?)\]/)?.[1]?.trim() || '자동선정';
};

const judge = (title: string, body: string, comments: string): {
  score: string;
  feedback: string;
  final: string;
} => {
  const text = `${title}\n${body}\n${comments}`;
  const issues: string[] = [];

  if (/완치|치료됩니다|낫습니다|효과가 확실|확실히 좋아|확실히 낫|무조건|보장/.test(text)) {
    issues.push('효능 단정 의심');
  }
  if ((body.match(/한려담원/g) || []).length > 1) {
    issues.push('본문 브랜드 반복');
  }
  if (!comments.includes('한려담원')) {
    issues.push('댓글 브랜드 언급 없음');
  }
  if (body.length < 120) {
    issues.push('본문 짧음');
  }

  if (issues.length === 0) {
    return { score: '0.82 자동PASS', feedback: 'PASS: 브랜드 허용, 효능 단정 없음', final: 'PASS' };
  }

  return {
    score: '0.62 자동검토',
    feedback: `REVIEW: ${issues.join(', ')}`,
    final: '사람승인 대기',
  };
};

const getSheets = async () => {
  const envVars = loadEnvFallback();
  const email = envVars.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = envVars.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '';
  const key = rawKey.replace(/\\n/g, '\n');

  if (!email || !key) {
    throw new Error('Google service account env missing');
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
};

const main = async (): Promise<void> => {
  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const target = meta.data.sheets?.find((sheet) => sheet.properties?.sheetId === TARGET_GID);
  const sheetName = target?.properties?.title;
  if (!sheetName) throw new Error(`target sheet not found: ${TARGET_GID}`);

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  });

  const rows: string[][] = [];
  console.log(`대상 시트: ${sheetName}`);
  console.log(`모델: ${MODEL}`);

  for (const keyword of KEYWORDS) {
    const prompt = buildOwnKeywordPrompt({ keyword, keywordType: 'own' });
    const angle = extractAngle(prompt);
    process.stdout.write(`[GEN] ${keyword} (${angle}) ... `);

    const startedAt = Date.now();
    const { content, model } = await generateViralContent({ prompt, model: MODEL });
    const parsed = parseViralResponse(content);
    const title = parsed?.title || parseTitle(content);
    const body = parsed?.body || parseBody(content);
    const comments = parsed?.comments?.length
      ? parsed.comments.join('\n')
      : parseComments(content);

    if (!title || !body) {
      throw new Error(`파싱 실패: ${keyword}`);
    }

    const qa = judge(title, body, comments);
    rows.push([
      'deepseek-v4-test',
      now,
      keyword,
      angle,
      qa.score,
      `cafe-bot buildOwnKeywordPrompt / model=${model || MODEL}`,
      title,
      body,
      comments,
      qa.feedback,
      qa.final,
    ]);

    console.log(`${Math.round((Date.now() - startedAt) / 1000)}초 / ${qa.final}`);
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:K`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  console.log(`시트 추가 완료: ${rows.length}행`);
  console.log(`URL: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${TARGET_GID}`);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
