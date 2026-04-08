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

  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";

  // 기존 키워드 중복 체크
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "카페키워드!A:A",
  });
  const existingKws = new Set((existing.data.values || []).flat().map((v: string) => v.trim()));

  // 쇼핑 + 샤넬 광고 키워드만 (건강 제외, 일상 제외)
  const adKeywords = [
    "천호엔케어 흑염소진액 후기",
    "임신준비 종합영양제",
    "한비담 흑염소진액 효능",
    "설운도 진생록 가격",
    "GNM자연의품격 흑염소진액",
    "산너미목장 흑염소 효능",
    "어머님 생신선물",
    "흑진담 흑염소진액 후기",
    "보령 흑염소진액 가격",
    "50대 엄마 생일선물",
  ];

  const toAdd = adKeywords.filter(kw => !existingKws.has(kw));
  if (toAdd.length === 0) {
    console.log("전부 이미 등록됨");
    return;
  }

  const rows = toAdd.map(kw => [kw]);
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "카페키워드!A:A",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ ${toAdd.length}개 쇼핑/샤넬 광고 키워드 카페키워드 시트에 기록`);
  toAdd.forEach(kw => console.log(`  - ${kw}`));
};

main();
