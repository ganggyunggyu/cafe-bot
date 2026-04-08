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

  const auth = new google.auth.JWT({
    email, key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = "1HErumqLrDcuCDlxnAlbB9efClvIVPihZq12kcUQzP2k";

  // 1. "타사키워드" 시트 생성
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: "타사키워드" } }
        }]
      }
    });
    console.log("✅ '타사키워드' 시트 생성 완료");
  } catch (e: any) {
    if (e.message?.includes("already exists")) {
      console.log("ℹ️ '타사키워드' 시트 이미 존재");
    } else {
      throw e;
    }
  }

  // 2. 헤더 + 데이터 준비
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
  const rows: string[][] = [["키워드", "브랜드", "노출구좌", "사용여부"]];

  for (const brand of brands) {
    for (const suffix of suffixes) {
      rows.push([brand.name + suffix, brand.short, "신로직", ""]);
    }
  }

  // 3. 데이터 쓰기
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "타사키워드!A1",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ ${rows.length - 1}개 타사 키워드 등록 완료`);
};

main();
