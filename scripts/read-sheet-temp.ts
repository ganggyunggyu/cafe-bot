import { google } from "googleapis";
import * as fs from "fs";

const main = async () => {
  const envContent = fs.readFileSync(".env", "utf-8");
  const envVars: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  const email = envVars.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = envVars.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "";
  const key = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";

  // 시트 목록 확인
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  for (const s of meta.data.sheets || []) {
    console.log(`시트: "${s.properties?.title}" (gid: ${s.properties?.sheetId})`);
  }

  // gid 1485226539에 해당하는 시트 찾기
  const targetSheet = meta.data.sheets?.find(s => s.properties?.sheetId === 1485226539);
  if (!targetSheet) { console.log("시트 못 찾음"); return; }
  const sheetName = targetSheet.properties?.title!;
  console.log(`\n대상 시트: "${sheetName}"`);

  // 헤더 + 첫 5행 확인
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z5`,
  });
  
  const rows = res.data.values || [];
  console.log(`\n=== 헤더 + 데이터 (${rows.length}행) ===`);
  for (const [i, row] of rows.entries()) {
    console.log(`행${i}: ${row.map((v: string, j: number) => `[${j}]${v}`).join(" | ")}`);
  }
};

main();
