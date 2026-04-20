/**
 * 쇼핑지름신 광고 키워드 → 구글시트 기록
 * Usage: npx tsx --env-file=.env.local scripts/append-kw-sheet.ts
 */
import { google } from "googleapis";
import * as fs from "fs";

const SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const SHEET_TAB = "카페키워드";

const NEW_KEYWORDS = [
  "오한진의 백세알부민",
  "홍삼진고 데일리스틱",
  "제주산 당찬여주 발효효소",
  "다이어트 유산균 비에날씬",
  "베지밀",
  "갱년기유산균YT1 메노락토 오리진",
  "산모 흑염소진액 추천",
  "임산부 흑염소 진액 효능",
  "흑염소진액 효능 비교",
  "흑염소진액 가격 비교",
  "닥터지 레드블레미쉬 클리어 수딩 크림",
  "멜릭서 비건 리페어 세럼",
  "헤라 블랙 쿠션 21호",
  "미니랩 시카 수분크림",
  "라네즈 워터뱅크 블루 하이알루로닉 크림",
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
