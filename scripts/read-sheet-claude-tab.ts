import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { google } from "googleapis";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const TAB = "카페키워드_클로드";

const main = async () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1:Z20`,
  });
  console.log(`=== ${TAB} (상위 20행) ===`);
  for (const row of res.data.values || []) {
    console.log(row.join(" | "));
  }

  const all = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A:Z`,
  });
  console.log(`\n총 ${(all.data.values || []).length}행`);
};

main().catch((e) => { console.error(e.message); process.exit(1); });
