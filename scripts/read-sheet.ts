import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { google } from "googleapis";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";

const main = async () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 시트 탭 목록
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  console.log("=== 시트 탭 목록 ===");
  for (const s of meta.data.sheets || []) {
    console.log(`  ${s.properties?.title} (gid: ${s.properties?.sheetId})`);
  }

  // gid=1923976827 탭 읽기
  const targetTab = meta.data.sheets?.find((s) => s.properties?.sheetId === 1923976827);
  const tabName = targetTab?.properties?.title || "카페키워드";
  
  console.log(`\n=== ${tabName} 헤더 + 최근 10행 ===\n`);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1:Z5`,
  });
  
  for (const row of res.data.values || []) {
    console.log(row.join(" | "));
  }

  // 마지막 10행
  const all = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A:Z`,
  });
  const rows = all.data.values || [];
  console.log(`\n=== 마지막 10행 (총 ${rows.length}행) ===\n`);
  for (const row of rows.slice(-10)) {
    console.log(row.join(" | "));
  }
};

main().catch((e) => { console.error(e.message); process.exit(1); });
