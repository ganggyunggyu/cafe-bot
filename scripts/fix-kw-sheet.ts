/**
 * 시트에서 김오곤 삭제 + 흑염소즙 브랜드 추가
 * Usage: npx tsx --env-file=.env.local scripts/fix-kw-sheet.ts
 */
import { google } from "googleapis";
import * as fs from "fs";

const SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const SHEET_TAB = "카페키워드";

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

  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });

  // 1. A열 읽기
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:A`,
  });
  const rows = res.data.values || [];

  // 2. 김오곤 행 찾아서 비우기
  let cleared = false;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0]?.includes("김오곤 프리미엄 마가목 흑염소 진액")) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_TAB}!A${i + 1}:F${i + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [[""]] },
      });
      console.log(`✅ 김오곤 삭제 (행 ${i + 1})`);
      cleared = true;
      break;
    }
  }
  if (!cleared) console.log("ℹ️ 김오곤 키워드 시트에 없음 (스킵)");

  // 3. 흑염소즙 브랜드 중복 체크 후 추가
  const existingSet = new Set(rows.flat().map((v: string) => v?.trim()));
  if (existingSet.has("흑염소즙 브랜드")) {
    console.log("ℹ️ 흑염소즙 브랜드 이미 있음 (스킵)");
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_TAB}!A:A`,
      valueInputOption: "RAW",
      requestBody: { values: [["흑염소즙 브랜드"]] },
    });
    console.log("✅ 흑염소즙 브랜드 추가 완료");
  }
};

main().catch((e) => { console.error("failed:", e.message); process.exit(1); });
