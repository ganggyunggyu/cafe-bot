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

  const rows = res.data.values || [];
  let competitor = 0, own = 0;
  for (const row of rows.slice(1)) {
    const kw = row[0] || "";
    const cafe = row[1] || "";
    const slot = row[2] || "";
    const vis = row[3] || "";
    if (!kw) continue;
    const type = cafe ? "타사" : "자사";
    if (cafe) competitor++; else own++;
    console.log(`${type}\t${kw}\t${cafe}\t${slot}\t${vis}`);
  }
  console.error(`\n총: 타사 ${competitor}개, 자사 ${own}개`);
};

main();
