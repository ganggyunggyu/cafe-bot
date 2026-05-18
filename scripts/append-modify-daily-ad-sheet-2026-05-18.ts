import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { google } from 'googleapis';

const SHEET_ID = '1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms';
const SHEET_TAB = '카페키워드';
const CAFE = '샤넬오픈런';
const TODAY = new Date().toISOString().slice(0, 10);

const KEYWORDS: Array<{ keyword: string; type: '자사' | '타사' }> = [
  { keyword: '에르메스 콘스탄스 24 골드 일요일 자정 매물 알림 기다리는 중', type: '자사' },
  { keyword: '에르메스 가든파티 36 깐돌 또 돌아왔어요', type: '자사' },
];

const main = async (): Promise<void> => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const rows = KEYWORDS.map((k) => [CAFE, k.keyword, TODAY, 1]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:D`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  console.log(`✅ ${rows.length}건 시트 기록 완료 (${TODAY})`);
};

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
