import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { google } from "googleapis";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const SHEET_TAB = "카페키워드";
const CAFE = "샤넬오픈런";
const TODAY = new Date().toISOString().slice(0, 10);

const KEYWORDS = [
  { keyword: "염소탕", type: "자사" },
  { keyword: "이경제 흑염소 진액", type: "타사" },
  { keyword: "빈혈에좋은음식", type: "자사" },
  { keyword: "김오곤 흑염소 진액 후기", type: "타사" },
  { keyword: "자궁선근증", type: "자사" },
  { keyword: "설운도 진생록 후기", type: "타사" },
  { keyword: "튼살크림", type: "자사" },
  { keyword: "산너미목장 흑염소", type: "타사" },
  { keyword: "계류유산", type: "자사" },
  { keyword: "매포흑염소목장 효능", type: "타사" },
  { keyword: "배란통", type: "자사" },
  { keyword: "한살림 흑염소진액 효능", type: "타사" },
  { keyword: "홍삼스틱", type: "자사" },
  { keyword: "천호엔케어 흑염소진액 후기", type: "타사" },
  { keyword: "칼슘영양제", type: "자사" },
  { keyword: "CMG제약 본래원 흑염소진액 가격", type: "타사" },
  { keyword: "에스트로겐", type: "자사" },
  { keyword: "뉴트리원라이프 흑염소진액 가격", type: "타사" },
  { keyword: "엽산효능", type: "자사" },
  { keyword: "건국 흑염소진액 골드 가격", type: "타사" },
  { keyword: "임산부영양제", type: "자사" },
  { keyword: "보령 흑염소진액 가격", type: "타사" },
  { keyword: "비타민D부족증상", type: "자사" },
  { keyword: "팔도감 흑염소진액 효능", type: "타사" },
  { keyword: "칼슘마그네슘", type: "자사" },
  { keyword: "한비담 흑염소진액 효능", type: "타사" },
  { keyword: "나팔관조영술", type: "자사" },
];

const main = async () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const rows = KEYWORDS.map((k) => [CAFE, k.keyword, TODAY, 1]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:D`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ ${rows.length}건 시트 기록 완료`);
};

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
