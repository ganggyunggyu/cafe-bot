import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { google } from "googleapis";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const TAB_NAME = "카페키워드";
const TAB_GID = 1923976827;

const KEYWORDS = [
  "염소탕", "빈혈에좋은음식", "자궁선근증", "튼살크림", "계류유산",
  "배란통", "홍삼스틱", "칼슘영양제", "에스트로겐", "엽산효능",
  "임산부영양제", "비타민D부족증상", "칼슘마그네슘", "나팔관조영술",
  "이경제 흑염소 진액", "김오곤 흑염소 진액 후기", "설운도 진생록 후기",
  "산너미목장 흑염소", "매포흑염소목장 효능", "한살림 흑염소진액 효능",
  "천호엔케어 흑염소진액 후기", "CMG제약 본래원 흑염소진액 가격",
  "뉴트리원라이프 흑염소진액 가격", "건국 흑염소진액 골드 가격",
  "보령 흑염소진액 가격", "팔도감 흑염소진액 효능", "한비담 흑염소진액 효능",
];

const main = async () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // 전체 데이터 읽기
  const all = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A:G`,
  });
  const rows = all.data.values || [];
  console.log(`현재 총 ${rows.length}행`);

  // 내가 잘못 넣은 행 찾기 (A열이 "샤넬오픈런"이고 C열이 "2026-04-06")
  const wrongRows: number[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row[0] === "샤넬오픈런" && row[2] === "2026-04-06") {
      wrongRows.push(i);
    }
  }
  console.log(`잘못된 행 ${wrongRows.length}개 발견`);

  // 삭제 (역순으로 삭제해야 인덱스 안 밀림)
  if (wrongRows.length > 0) {
    const requests = wrongRows.map((rowIdx) => ({
      deleteDimension: {
        range: {
          sheetId: TAB_GID,
          dimension: "ROWS",
          startIndex: rowIdx,
          endIndex: rowIdx + 1,
        },
      },
    }));

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests },
    });
    console.log(`✅ ${wrongRows.length}행 삭제 완료`);
  }

  // 키워드만 A열에 추가
  const keywordRows = KEYWORDS.map((k) => [k]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A:A`,
    valueInputOption: "RAW",
    requestBody: { values: keywordRows },
  });
  console.log(`✅ ${KEYWORDS.length}개 키워드 A열에 추가 완료`);
};

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
