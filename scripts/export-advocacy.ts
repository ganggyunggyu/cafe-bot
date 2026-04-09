import dotenv from 'dotenv';
dotenv.config({ path: '/Users/ganggyunggyu/Programing/cafe-bot/.env' });
dotenv.config({ path: '/Users/ganggyunggyu/Programing/cafe-bot/.env.local', override: true });

import fs from 'fs';
import { google } from 'googleapis';

const SHEET_ID = '1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms';
const TAB_NAME = `타사옹호원고_${new Date().toISOString().slice(0, 10)}`;
const DATA_FILE = '/Users/ganggyunggyu/Programing/cafe-bot/scripts/advocacy-manuscripts.txt';

const parseManuscript = (raw: string): { title: string; body: string; comments: string } => {
  let title = '';
  let body = '';
  let comments = '';

  // Try tagged format first
  const titleMatch = raw.match(/\[제목\]\s*\n?(.+)/);
  if (titleMatch) title = titleMatch[1].trim();

  const bodyMatch = raw.match(/\[본문\]\s*\n([\s\S]*?)(?=\[댓글\]|\[댓글1\])/);
  if (bodyMatch) {
    body = bodyMatch[1].trim()
      .replace(/\n#[^\n]+$/gm, '') // strip hashtags
      .replace(/\n---\s*$/gm, '') // strip separators
      .trim();
  }

  const commentsMatch = raw.match(/\[댓글\]\s*\n([\s\S]*)/) || raw.match(/(\[댓글1\][\s\S]*)/);
  if (commentsMatch) {
    comments = commentsMatch[1].trim()
      .replace(/\n#[^\n]+$/gm, '')
      .replace(/\n---\s*$/gm, '')
      .trim();
  }

  // Fallback
  if (!title || !body) {
    const commentStart = raw.search(/\[댓글1\]/);
    if (commentStart > 0) {
      const before = raw.substring(0, commentStart).trim();
      const after = raw.substring(commentStart).trim();
      const lines = before.split('\n');
      title = title || lines[0]?.replace(/\[제목\]\s*/, '').trim() || '';
      body = body || lines.slice(1).join('\n').replace(/\[본문\]\s*\n?/, '').trim();
      comments = comments || after;
    }
  }

  return { title, body, comments };
};

const main = async () => {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const entries = raw.split('---NEXT---').filter((s) => s.trim());

  const results = entries.map((entry) => {
    const lines = entry.trim().split('\n');
    const keywordLine = lines.find((l) => l.startsWith('KEYWORD:'));
    const keyword = keywordLine?.replace('KEYWORD:', '').trim() || '';
    const text = lines.slice(1).join('\n');
    const parsed = parseManuscript(text);
    return { keyword, ...parsed };
  });

  console.log(`Parsed ${results.length} manuscripts:`);
  for (const r of results) {
    console.log(`  ${r.keyword} → "${r.title}" (body: ${r.body.length}c, comments: ${r.comments.length}c)`);
  }

  // Google Sheets export
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Create tab
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
      },
    });
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      const uniqueTab = `${TAB_NAME}_v${Date.now() % 1000}`;
      console.log(`Tab exists, using: ${uniqueTab}`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: uniqueTab } } }],
        },
      });
      // Update range to use unique tab
      const header = ['#', '키워드', '제목', '본문', '댓글'];
      const rows = results.map((r, idx) => [idx + 1, r.keyword, r.title, r.body, r.comments]);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${uniqueTab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [header, ...rows] },
      });
      console.log(`\nDone! ${results.length} manuscripts → ${uniqueTab}`);
      return;
    }
    throw e;
  }

  const header = ['#', '키워드', '제목', '본문', '댓글'];
  const rows = results.map((r, idx) => [idx + 1, r.keyword, r.title, r.body, r.comments]);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [header, ...rows] },
  });

  console.log(`\nDone! ${results.length} manuscripts → ${TAB_NAME}`);
  console.log(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
};

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
