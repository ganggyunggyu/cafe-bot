/**
 * 쇼핑지름신 광고 키워드 → 구글시트 기록
 * Usage: npx tsx --env-file=.env.local scripts/append-kw-sheet.ts
 */
import { google } from "googleapis";
import * as fs from "fs";

const SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const SHEET_TAB = "카페키워드";

const NEW_KEYWORDS = [
  "정식품 베지밀 고단백두유 검은콩",
  "어린이 면역력 영양제",
  "닥터파이토 덴티백 PRO 구강유산균 M18",
  "60대 엄마 생일선물",
  "종근당건강 프로메가 알티지 오메가3 비타민D",
  "출산후 영양제",
  "락토핏 맥스19 유산균",
  "키크는 영양제",
  "김오곤 프리미엄 마가목 흑염소 진액",
  "164 루테인지아잔틴GR",
];

const main = async () => {
  const envFile = ".env";
  const envContent = fs.readFileSync(envFile, "utf-8");
  const envVars: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }

  const email = envVars.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = envVars.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "";
  const key = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email, key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 1. 기존 A열 읽어서 중복 체크
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:A`,
  });
  const existingSet = new Set(
    (existing.data.values || []).flat().map((v: string) => v.trim())
  );

  const toAppend = NEW_KEYWORDS.filter((kw) => !existingSet.has(kw));
  const skipped = NEW_KEYWORDS.length - toAppend.length;

  if (toAppend.length === 0) {
    console.log(`전부 중복 (${skipped}건 스킵)`);
    return;
  }

  // 2. A열에 키워드만 append
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:A`,
    valueInputOption: "RAW",
    requestBody: {
      values: toAppend.map((kw) => [kw]),
    },
  });

  console.log(`✅ ${toAppend.length}건 기록 완료 (중복 ${skipped}건 스킵)`);
};

main().catch((e) => { console.error("sheet append failed:", e.message); process.exit(1); });
