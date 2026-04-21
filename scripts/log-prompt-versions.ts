/**
 * 일상글 프롬프트 v0~v10 + 멀티 모델 결과 시트 기록
 * Spreadsheet: 1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms
 * Tab gid: 1761974693
 */
import { google } from "googleapis";
import * as fs from "fs";

const SPREADSHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const TAB_GID = 1761974693;

interface VersionEntry {
  version: string;
  model: string;
  file: string;
  score: string;
  note: string;
}

const VERSIONS: VersionEntry[] = [
  { version: "v0", model: "claude-sonnet-4-6", file: "/tmp/daily-v0-sonnet.md", score: "38", note: "기본 프롬프트 (MOODS+TONES). 클리셰 도배." },
  { version: "v1", model: "claude-sonnet-4-6", file: "/tmp/daily-v1-sonnet.md", score: "62", note: "MOODS 제거, 클리셰 금지. '그냥' 부작용." },
  { version: "v2", model: "claude-sonnet-4-6", file: "/tmp/daily-v2-sonnet.md", score: "79", note: "'그냥' 제한, 댓글 길이 편차, 제목 패턴 랜덤." },
  { version: "v3", model: "claude-sonnet-4-6", file: "/tmp/daily-v3-sonnet.md", score: "71", note: "ENDING 추가. 퓨샷 복제 부작용." },
  { version: "v4", model: "claude-sonnet-4-6", file: "/tmp/daily-v4-sonnet.md", score: "82", note: "ENDING 추상화, 이모지 금지 강화." },
  { version: "v5", model: "claude-sonnet-4-6", file: "/tmp/daily-v5-sonnet.md", score: "76", note: "과한 강조 추가 → 역효과." },
  { version: "v6", model: "claude-sonnet-4-6", file: "/tmp/daily-v6-sonnet.md", score: "80", note: "v4 롤백 + 이모지 완전 OFF." },
  { version: "v7", model: "claude-sonnet-4-6", file: "/tmp/daily-v7-sonnet.md", score: "86", note: "초단문 대댓글 금지, 작성자 답글 맥락 일치." },
  { version: "v8", model: "claude-sonnet-4-6", file: "/tmp/daily-v8-sonnet.md", score: "85", note: "답글-본문 모순 금지." },
  { version: "v9", model: "claude-sonnet-4-6", file: "/tmp/daily-v9-sonnet.md", score: "84", note: "댓글 흐름 강제, 본문 디테일 받아치기." },
  { version: "v10", model: "claude-sonnet-4-6", file: "/tmp/daily-v10-sonnet.md", score: "87", note: "단답 마지막 위치 강제. ⭐ 최종 배포 버전." },
  { version: "v10", model: "claude-haiku-4-5", file: "/tmp/daily-v10-haiku.md", score: "TBD", note: "같은 프롬프트, Haiku 4.5로 비교 테스트." },
  { version: "v10", model: "gemini-2.5-flash", file: "/tmp/daily-v10-gemini-flash.md", score: "TBD", note: "같은 프롬프트, Gemini 2.5 Flash로 비교 테스트." },
  { version: "v10", model: "gemini-3-flash-preview", file: "/tmp/daily-v10-gemini3flash.md", score: "TBD", note: "같은 프롬프트, Gemini 3 Flash Preview로 비교 테스트." },
  { version: "v10", model: "gpt-5-nano", file: "/tmp/daily-v10-gpt-nano.md", score: "TBD", note: "같은 프롬프트, GPT-5 Nano(구)로 비교 테스트." },
  { version: "v10", model: "gpt-5.4-nano", file: "/tmp/daily-v10-gpt54nano.md", score: "TBD", note: "같은 프롬프트, GPT-5.4 Nano(최신)로 비교 테스트." },
  { version: "v10", model: "gemini-3.1-flash-lite-preview", file: "/tmp/daily-v10-gemini31flashlite-correct.md", score: "74", note: "Gemini 3.1 Flash-Lite Preview. 포맷 오류 리스크." },
  { version: "v10", model: "gpt-5-nano-2025-08-07", file: "/tmp/daily-v10-gpt5nano-correct.md", score: "FAIL", note: "OpenAI API 키 401 에러 (백엔드 키 만료)." },
  { version: "v10", model: "gpt-5.4-mini-2026-03-17", file: "/tmp/daily-v10-gpt54mini.md", score: "FAIL", note: "OpenAI API 키 401 에러." },
  { version: "v10", model: "gpt-5.4-nano", file: "/tmp/daily-v10-gpt54nano-correct.md", score: "FAIL", note: "OpenAI API 키 401 에러." },
  { version: "v11", model: "claude-sonnet-4-6", file: "/tmp/daily-v11-sonnet.md", score: "TBD", note: "단답 강제 약화 (1개로). 사용자 비판: 단답 굳이 왜 넣냐." },
  { version: "v11", model: "gemini-3.1-flash-preview", file: "/tmp/daily-v11-gemini31flash.md", score: "FAIL", note: "Google AI v1beta 404 (모델 미등록). 검색 결과는 있다고 했으나 실제 API에 없음." },
  { version: "v12", model: "claude-sonnet-4-6", file: "/tmp/daily-v12-sonnet.md", score: "FAIL", note: "프롬프트 95줄로 경량화. 형식 깨짐 ([댓글1] 없이 [댓글러-1] 시작)." },
  { version: "v12.1", model: "claude-sonnet-4-6", file: "/tmp/daily-v12-sonnet-fix.md", score: "TBD", note: "v12 + 댓글 형식 강화 ([댓글1] 첫줄 강제)." },
  { version: "v12", model: "gemini-flash-latest", file: "/tmp/daily-v12-geminiflashlatest.md", score: "58", note: "v12 경량 + Gemini Flash 최신 alias. 댓글 단답·인위적 별명·일부 누락." },
  { version: "v12.1", model: "gemini-3.1-flash-lite-preview", file: "/tmp/daily-v12-gemini31lite.md", score: "78", note: "v12 + 3.1 Lite. v10(74)→78 개선. [제3자-4] 포맷 오류 잔존." },
  { version: "v13", model: "claude-sonnet-4-6", file: "/tmp/daily-v13-sonnet.md", score: "91", note: "★90점 돌파★ 작성자 답글 동조 루프 깸 + 본문 100자 강제. 디올/에르메스 두꺼워짐." },
  { version: "v13", model: "gemini-3.1-flash-lite-preview", file: "/tmp/daily-v13-gemini31lite.md", score: "82", note: "v13 + 3.1 Lite. v10(74)→v12(78)→v13(82) 진화. 가성비 운영 가능 수준. 비용 $3/월." },
];

const main = async () => {
  const envContent = fs.readFileSync(".env", "utf-8");
  const envVars: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) envVars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }

  const auth = new google.auth.JWT({
    email: envVars.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (envVars.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === TAB_GID);
  if (!sheet) throw new Error(`gid ${TAB_GID} 탭 없음`);
  const tabName = sheet.properties!.title!;
  console.log(`탭: ${tabName}`);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:Z`,
  });

  const rows: any[][] = [
    ["버전", "모델", "점수", "키워드", "제목", "본문", "댓글수", "비고"],
  ];

  for (const v of VERSIONS) {
    if (!fs.existsSync(v.file)) {
      console.log(`⚠ ${v.file} 없음 — 스킵`);
      continue;
    }
    const content = fs.readFileSync(v.file, "utf-8");
    const blocks = content.split(/\n---\n/).slice(1);

    rows.push([v.version, v.model, v.score, "", "", v.note, "", ""]);

    for (const block of blocks) {
      const kwMatch = block.match(/## 키워드: (.+)/);
      const titleMatch = block.match(/### 제목\n(.+)/);
      const bodyMatch = block.match(/### 본문\n([\s\S]+?)(?=\n### 댓글|\n###|$)/);
      const commentsMatch = block.match(/### 댓글 \((\d+)개\)([\s\S]+?)(?=\n---|\n##|$)/);

      const keyword = kwMatch ? kwMatch[1].trim() : "";
      const title = titleMatch ? titleMatch[1].trim() : "";
      const body = bodyMatch ? bodyMatch[1].trim() : "";
      const commentCount = commentsMatch ? commentsMatch[1] : "";
      const commentsBlock = commentsMatch ? commentsMatch[2].trim() : "";

      rows.push(["", "", "", keyword, title, body, commentCount, commentsBlock]);
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });

  console.log(`✅ ${rows.length - 1}행 기록 완료`);
};

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
