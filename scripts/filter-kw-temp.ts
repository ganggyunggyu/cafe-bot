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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1zU8Jr2qH_T1JkMoi6SHgWbeeQBLMbLan8wLQ3jSlmhI",
    range: "카페_관련 키워드!E:H",
  });

  // 사용된 키워드 로드
  const usedRaw = fs.readFileSync("scripts/keywords/used-keywords.txt", "utf-8");
  const usedSet = new Set(usedRaw.split("\n").map(l => l.trim()).filter(Boolean));

  const rows = res.data.values || [];
  const competitor: string[] = [];
  const own: string[] = [];

  for (const row of rows.slice(1)) {
    const kw = (row[0] || "").trim();
    const cafe = (row[1] || "").trim();
    if (!kw) continue;
    // 슬래시로 구분된 경우 첫번째만
    const mainKw = kw.includes("/") ? kw.split("/")[0].trim() : kw;
    if (usedSet.has(mainKw) || usedSet.has(kw)) continue;
    // 짧은 키워드 제외 (1글자 등)
    if (mainKw.length < 2) continue;
    
    if (cafe) {
      competitor.push(mainKw);
    } else {
      own.push(mainKw);
    }
  }

  console.log("=== 미사용 타사 키워드 ===");
  competitor.forEach(k => console.log(`타사: ${k}`));
  console.log(`\n타사 미사용: ${competitor.length}개`);

  console.log("\n=== 미사용 자사 키워드 (앞 60개) ===");
  own.slice(0, 60).forEach(k => console.log(`자사: ${k}`));
  console.log(`\n자사 미사용: ${own.length}개`);
};

main();
