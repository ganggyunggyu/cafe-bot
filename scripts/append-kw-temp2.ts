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

  // API key 방식 대신, 서비스 계정에 spreadsheets 전체 스코프 사용
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = "1zU8Jr2qH_T1JkMoi6SHgWbeeQBLMbLan8wLQ3jSlmhI";

  // 기존 키워드 중복 체크
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "카페_관련 키워드!E:E",
  });
  const existingKws = new Set(
    (existing.data.values || []).flat().map((v: string) => v.trim())
  );
  console.log(`기존 키워드: ${existingKws.size}개`);

  // 사용된 키워드
  const usedRaw = fs.readFileSync("scripts/keywords/used-keywords.txt", "utf-8");
  const usedSet = new Set(usedRaw.split("\n").map(l => l.trim()).filter(Boolean));

  const brands = [
    { name: "이경제 흑염소 진액", short: "이경제" },
    { name: "김오곤 흑염소 진액", short: "김오곤" },
    { name: "설운도 진생록", short: "설운도" },
    { name: "산너미목장 흑염소", short: "산너미목장" },
    { name: "매포흑염소목장", short: "매포흑염소" },
    { name: "한살림 흑염소진액", short: "한살림" },
    { name: "천호엔케어 흑염소진액", short: "천호엔케어" },
    { name: "GNM자연의품격 흑염소진액", short: "GNM" },
    { name: "CMG제약 본래원 흑염소진액", short: "CMG제약" },
    { name: "뉴트리원라이프 흑염소진액", short: "뉴트리원" },
    { name: "건국 흑염소진액 골드", short: "건국" },
    { name: "보령 흑염소진액", short: "보령" },
    { name: "팔도감 흑염소진액", short: "팔도감" },
    { name: "공앤진 흑염소진액", short: "공앤진" },
    { name: "한비담 흑염소진액", short: "한비담" },
    { name: "흑진담 흑염소진액", short: "흑진담" },
    { name: "흑담만 가지산흑염소", short: "흑담만" },
    { name: "지리산마천농협 흑염소진액", short: "마천농협" },
    { name: "괴산흑염소 진액", short: "괴산흑염소" },
    { name: "솔미농장 흑염소진액", short: "솔미농장" },
    { name: "참앤들황토농원 흑염소진액", short: "황토농원" },
    { name: "즙쟁이 흑염소진액", short: "즙쟁이" },
    { name: "내추럴박스 흑염소진액", short: "내추럴박스" },
  ];

  const suffixes = ["", " 후기", " 가격", " 효능"];
  const rows: string[][] = [];

  for (const brand of brands) {
    for (const suffix of suffixes) {
      const kw = brand.name + suffix;
      if (existingKws.has(kw)) continue; // 시트에 이미 있음
      rows.push([kw, brand.short, "신로직", "O"]);
    }
  }

  if (rows.length === 0) {
    console.log("추가할 키워드 없음 (전부 이미 존재)");
    return;
  }

  console.log(`추가할 키워드: ${rows.length}개`);

  const result = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "카페_관련 키워드!E:H",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ ${rows.length}개 타사 키워드 시트 추가 완료`);
  console.log(`업데이트 범위: ${result.data.updates?.updatedRange}`);
};

main();
