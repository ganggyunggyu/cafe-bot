import { google } from "googleapis";
import * as fs from "fs";

const loadEnvFile = (filePath: string): Record<string, string> => {
  const vars: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) vars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // file not found, skip
  }
  return vars;
};

const main = async () => {
  const envVars = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };

  const email = envVars.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = envVars.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "";
  const key = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1zU8Jr2qH_T1JkMoi6SHgWbeeQBLMbLan8wLQ3jSlmhI",
    range: "카페_관련 키워드!E:H",
  });

  const rows = res.data.values || [];
  const competitors: string[] = [];
  const owns: string[] = [];

  for (const row of rows.slice(1)) {
    const keyword = row[0] || "";
    const cafeName = row[1] || "";
    const slot = row[2] || "";
    const visible = row[3] || "";
    if (!keyword) continue;

    if (cafeName) {
      competitors.push(`${keyword}\t${cafeName}\t${slot}\t${visible}`);
    } else {
      owns.push(keyword);
    }
  }

  console.log(`=== 타사 키워드 (카페명 있음) === [${competitors.length}개]`);
  competitors.forEach((c, i) => {
    const [kw, cafe, slot, vis] = c.split("\t");
    console.log(`  ${i + 1}. ${kw} (카페: ${cafe}, 구좌: ${slot}, 노출: ${vis})`);
  });

  console.log(`\n=== 자사 키워드 (카페명 없음) === [${owns.length}개]`);
  owns.forEach((kw, i) => {
    console.log(`  ${i + 1}. ${kw}`);
  });

  console.log(`\n=== 총계 ===`);
  console.log(`타사: ${competitors.length}개 / 자사: ${owns.length}개 / 전체: ${competitors.length + owns.length}개`);
};

main().catch(console.error);
