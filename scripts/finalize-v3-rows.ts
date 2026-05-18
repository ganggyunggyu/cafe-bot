import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import { formatComments } from "./format-comments-claude-tab";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const OUT_TAB = "카페원고_0518_v2";
const MANIFEST = "/tmp/v3-prompts/manifest.json";

interface ManifestItem {
  idx: number;
  keyword: string;
  promptFile: string;
  outFile: string;
  refCount: number;
  promptLen: number;
}

const getAuth = () =>
  new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

const cleanContent = (raw: string): string => {
  return raw
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^#{1,6}\s/.test(t)) return false;
      if (/^-{3,}$/.test(t) || /^={3,}$/.test(t)) return false;
      if (/^\(사진[:\s]/.test(t)) return false;
      if (/^\(테이블/.test(t)) return false;
      if (/^\(스마트폰/.test(t)) return false;
      if (/^\([^)]*사진[^)]*\)$/.test(t)) return false;
      if (/^\([^)]*구도[^)]*\)$/.test(t)) return false;
      return true;
    })
    .map((line) => {
      let l = line;
      l = l.replace(/\*\*(.+?)\*\*/g, "$1");
      l = l.replace(/__(.+?)__/g, "$1");
      l = l.replace(/^>\s*/, "");
      return l;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
};

const estimateCostUSD = (promptLen: number, outputText: string): number => {
  const inputTokens = promptLen / 2.5;
  const outputTokens = outputText.length / 2.5;
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  return Math.round((inputCost + outputCost) * 10000) / 10000;
};

const main = async () => {
  const manifest: ManifestItem[] = JSON.parse(readFileSync(MANIFEST, "utf-8"));
  console.log(`manifest ${manifest.length}개`);

  const sheets = google.sheets({ version: "v4", auth: getAuth() });

  // 헤더에 H 컬럼(추정비용USD) 추가 확인
  const header = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${OUT_TAB}!A1:H1`,
  });
  const cur = header.data.values?.[0] || [];
  if (cur.length < 8) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${OUT_TAB}!A1:H1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["키워드", "제목", "본문", "댓글", "댓글수", "참고검색수", "생성일", "추정비용(USD)"]],
      },
    });
    console.log("✓ H 컬럼(추정비용USD) 헤더 추가");
  }

  const today = new Date().toISOString().split("T")[0];
  const rowsToAppend: (string | number)[][] = [];

  let ok = 0, fail = 0, totalCost = 0;
  for (const m of manifest) {
    if (!existsSync(m.outFile)) {
      console.log(`[${m.idx}] ${m.keyword} ⏳ 출력 없음`);
      continue;
    }
    const rawContent = readFileSync(m.outFile, "utf-8");
    const content = cleanContent(rawContent);
    const parsed = parseViralResponse(content);
    if (!parsed) {
      console.log(`[${m.idx}] ${m.keyword} ❌ 파싱실패`);
      rowsToAppend.push([m.keyword, "[파싱실패]", content.slice(0, 4000), "", 0, m.refCount, today, 0]);
      fail++;
      continue;
    }
    const body = cleanContent(parsed.body);
    const commentsText = formatComments(JSON.stringify(parsed.comments));
    const outputBytes = (parsed.title + body + commentsText).length;
    const cost = estimateCostUSD(m.promptLen, parsed.title + body + commentsText);
    totalCost += cost;
    rowsToAppend.push([
      m.keyword,
      parsed.title,
      body,
      commentsText,
      parsed.comments.length,
      m.refCount,
      today,
      cost,
    ]);
    console.log(`[${m.idx}] ${m.keyword} ✅ 본문${body.length}자 댓글${parsed.comments.length}개 비용$${cost}`);
    ok++;
  }

  if (rowsToAppend.length === 0) {
    console.log("기록할 행 없음");
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${OUT_TAB}!A:H`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rowsToAppend },
  });

  console.log(`\n=== 시트 기록 완료 ===`);
  console.log(`성공 ${ok} / 실패 ${fail}`);
  console.log(`총 추정 비용: $${Math.round(totalCost * 10000) / 10000}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
