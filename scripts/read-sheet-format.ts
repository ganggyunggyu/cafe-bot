import { google } from "googleapis";
import * as fs from "fs";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const creds = JSON.parse(fs.readFileSync("credentials/sheet-service-account.json", "utf-8"));

const auth = new google.auth.JWT(creds.client_email, undefined, creds.private_key, [
  "https://www.googleapis.com/auth/spreadsheets",
]);

const sheets = google.sheets({ version: "v4", auth });

const main = async () => {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetNames = meta.data.sheets?.map(s => `${s.properties?.title} (gid:${s.properties?.sheetId})`) || [];
  console.log("Sheets:", sheetNames.join(", "));

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "한려담원 카페 원고!A1:K3",
  });
  console.log("\nHeader + sample:");
  for (const row of res.data.values || []) {
    console.log(row.map((v: string, i: number) => `[${String.fromCharCode(65+i)}]${v?.substring(0, 50)}`).join(" | "));
  }

  const lastRows = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "한려담원 카페 원고!A78:K82",
  });
  console.log("\nLast rows:");
  for (const row of lastRows.data.values || []) {
    console.log(row.map((v: string, i: number) => `[${String.fromCharCode(65+i)}]${v?.substring(0, 80)}`).join(" | "));
  }
};

main().catch(console.error);
