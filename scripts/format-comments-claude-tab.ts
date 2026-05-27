import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { google } from "googleapis";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const TAB = "카페원고_0518_클로드";

interface ParsedComment {
  index: number;
  type: "comment" | "author_reply" | "commenter_reply" | "other_reply";
  parentIndex?: number;
  content: string;
}

const TYPE_LABEL: Record<string, string> = {
  comment: "댓글",
  author_reply: "작성자",
  commenter_reply: "댓글러",
  other_reply: "제3자",
};

export const formatComments = (raw: string): string => {
  if (!raw || raw.trim() === "" || raw === "[]") return "";
  let arr: ParsedComment[];
  try {
    arr = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(arr) || arr.length === 0) return "";

  const topComments = arr.filter((c) => c.type === "comment");
  const replies = arr.filter((c) => c.type !== "comment");

  const lines: string[] = [];
  for (const top of topComments) {
    lines.push(`[댓글${top.index}] ${top.content}`);
    const children = replies.filter((r) => r.parentIndex === top.index);
    for (const ch of children) {
      const label = TYPE_LABEL[ch.type] ?? ch.type;
      lines.push(`   └ [${label}] ${ch.content}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
};

const main = async () => {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:F`,
  });
  const rows = res.data.values || [];
  console.log(`총 ${rows.length}행 처리`);

  const updates: { range: string; values: string[][] }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][3] || "";
    if (!raw.startsWith("[{")) continue;
    const formatted = formatComments(raw);
    updates.push({
      range: `${TAB}!D${i + 2}`,
      values: [[formatted]],
    });
  }

  console.log(`변환 대상 ${updates.length}개`);
  if (updates.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: updates,
    },
  });
  console.log(`✅ ${updates.length}개 행 댓글 컬럼 정리 완료`);
};

if (process.argv[1] === __filename) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
