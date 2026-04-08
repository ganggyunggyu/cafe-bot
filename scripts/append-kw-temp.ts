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
  const spreadsheetId = "1zU8Jr2qH_T1JkMoi6SHgWbeeQBLMbLan8wLQ3jSlmhI";

  // 기존 키워드 중복 체크
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "카페_관련 키워드!E:E",
  });
  const existingKws = new Set((existing.data.values || []).flat().map((v: string) => v.trim()));

  const newKeywords = [
    ["이경제 흑염소 진액", "이경제", "신로직", "O"],
    ["김오곤 흑염소 진액", "김오곤", "신로직", "O"],
    ["설운도 진생록", "설운도", "신로직", "O"],
    ["산너미목장 흑염소", "산너미목장", "신로직", "O"],
    ["매포흑염소목장", "매포흑염소", "신로직", "O"],
    ["한살림 흑염소진액", "한살림", "신로직", "O"],
  ];

  const toAdd = newKeywords.filter(([kw]) => !existingKws.has(kw));

  if (toAdd.length === 0) {
    console.log("전부 이미 존재함 — 추가 없음");
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "카페_관련 키워드!E:H",
    valueInputOption: "RAW",
    requestBody: { values: toAdd },
  });

  console.log(`${toAdd.length}개 타사 키워드 추가 완료:`);
  toAdd.forEach(([kw, cafe]) => console.log(`  - ${kw} (${cafe})`));
};

main();
