/**
 * 쇼핑지름신 광고 키워드 → 구글시트 기록
 * Usage: npx tsx --env-file=.env.local scripts/append-kw-sheet.ts
 */
import { google } from "googleapis";
import * as fs from "fs";

const SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const SHEET_TAB = "카페키워드";

const NEW_KEYWORDS = [
  "닥터린 하이퍼셀 대마종자유",
  "비에날씬 프로 패밀리세트",
  "대원제약 혈당파이터",
  "카무트 브랜드밀 견과바",
  "프리미엄 윤방부박사의 넘버원 알부민",
  "담백한 베지밀A 검은콩두유",
  "비에날 씬 프로",
  "한미사이언스 완 전두유",
  "60대 엄마 생일선물",
  "출산후 산모 선물",
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
