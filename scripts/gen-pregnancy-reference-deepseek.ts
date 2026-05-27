import dotenv from "dotenv";
dotenv.config({ path: "/Users/ganggyunggyu/Programing/naver-search-engine/.env" });
dotenv.config({ path: ".env" });

import { google } from "googleapis";
import { parseViralResponse } from "../src/features/viral/viral-parser";
import { buildPregnancyReferencePrompt } from "./build-pregnancy-reference-prompt";
import { formatComments } from "./format-comments-claude-tab";

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const OUT_TAB = "카페원고_0527_딥시크";
const CONTENT_API = process.env.CONTENT_API_URL || "http://localhost:8000";
const MODEL = process.env.GEN_MODEL || "deepseek-v4-flash";
const PROMPT_VERSION = "pregnancy-reference-v1";
const SLEEP_MS = Number.parseInt(process.env.SLEEP_MS || "1200", 10);
const LIMIT = Number.parseInt(process.env.LIMIT || "0", 10);

interface KeywordCase {
  type: string;
  keyword: string;
  note: string;
  persona: string;
}

interface ParsedBodyOnly {
  title: string;
  body: string;
}

interface CommentDiversityCheck {
  ok: boolean;
  reason: string;
}

interface CommentCluster {
  name: string;
  instruction: string;
}

const KEYWORD_CASES: KeywordCase[] = [
  {
    type: "계류유산 회복/증상형",
    keyword: "계류유산 후 생리 지연",
    note: "자연배출 뒤 50일 넘게 생리가 오지 않아 병원 재방문을 망설이는 타임라인",
    persona: "처음 계류유산을 겪고 괜찮은 척하지만 병원 앱 알림만 봐도 손이 차가워지는 32살 여성",
  },
  {
    type: "계류유산 회복/증상형",
    keyword: "고사난자 소파술 후기",
    note: "9주차 고사난자 진단부터 수술 당일 회복실까지의 세밀한 기록",
    persona: "수술 전에는 담담한 척했지만 회복실 천장 무늬까지 기억나는 34살 여성",
  },
  {
    type: "계류유산 감정/멘탈형",
    keyword: "계류유산 후 우울감",
    note: "엄마 탓이 아닌 걸 알지만 자책이 올라오는 밤의 자기고백",
    persona: "밤마다 검색하다가 남편 잠든 뒤 조용히 우는 31살 첫 임신 준비 여성",
  },
  {
    type: "화학적 유산 후 재임신형",
    keyword: "화학적 유산 후 자연임신",
    note: "계류유산, 화학적 유산, 재임신까지 월별 흐름과 감정 변화",
    persona: "희미한 두 줄을 보고도 기뻐하기보다 먼저 겁부터 나는 33살 여성",
  },
  {
    type: "습관성 유산 검사/병원형",
    keyword: "습관성 유산 검사 후기",
    note: "반복 유산 후 검사와 PGT, 출산까지 이어지는 조심스러운 성공담",
    persona: "네 번째 유산 뒤 검사 파일을 폴더에 모아두며 버틴 39살 여성",
  },
  {
    type: "난임 원인 탐색형",
    keyword: "자궁내막 얇음 임신 준비",
    note: "처음 진단받고 내막 두께와 착상 걱정으로 혼란스러운 상황",
    persona: "숫자 하나에 하루 기분이 바뀌는 36살 직장인",
  },
  {
    type: "난임 원인 탐색형",
    keyword: "자궁내막증 임신 성공",
    note: "자궁내막증 판정 후 시험관을 고민하고 시도한 과정",
    persona: "진단명을 듣고 집에 와서 검색창을 못 닫는 35살 여성",
  },
  {
    type: "난임 시술 전후형",
    keyword: "비수면 난자채취 후기",
    note: "나팔관조영술, 난자채취, 주사 통증을 현실적으로 비교",
    persona: "통증이 무서워 후기만 수십 개 읽고도 예약을 미루던 37살 여성",
  },
  {
    type: "난임 시술 전후형",
    keyword: "시험관 이식 후 증상",
    note: "이식 후 기다림, 사소한 증상 검색, 피검 전 불안",
    persona: "이식 후 배가 한 번 당길 때마다 카페 검색부터 하는 34살 여성",
  },
  {
    type: "시험관 장기 여정형",
    keyword: "40대 시험관 성공 후기",
    note: "40대, 여러 질환과 반복 실패 뒤 성공까지 이어진 긴 여정",
    persona: "성공했다는 말을 쓰면서도 아직 조심스러워 문장을 몇 번 지우는 42살 여성",
  },
  {
    type: "시험관 장기 여정형",
    keyword: "시험관 7차 성공 후기",
    note: "첫째 자연임신 이후 둘째 난임으로 여러 차례 시도한 흐름",
    persona: "첫째 질문에 웃어주다가도 둘째 준비 얘기만 나오면 목이 메는 40살 엄마",
  },
  {
    type: "시험관 장기 여정형",
    keyword: "시험관 21차 성공 후기",
    note: "5년 가까운 장기 시도, 실패 회차마다 마음을 추스른 기록",
    persona: "실패 회차를 숫자로 세다 보니 마음이 무뎌진 듯하지만 사실 오래 지친 40살 여성",
  },
  {
    type: "산후 회복형",
    keyword: "산후탈모 정수리",
    note: "거울로 정수리를 보고 충격받은 순간과 치료 고민",
    persona: "아기 재우고 화장실 불빛 아래 정수리를 확인하다 울컥한 산후 4개월 엄마",
  },
  {
    type: "산후 회복형",
    keyword: "자연분만 회음부 회복",
    note: "출산 직후 통증, 좌욕, 걷기, 진통제, 회복 기간을 현실적으로 정리",
    persona: "아기는 예쁜데 화장실 가는 시간이 무서울 정도로 회복이 힘든 산후 2주 엄마",
  },
  {
    type: "산후조리 실전형",
    keyword: "산후도우미 정부지원 후기",
    note: "정부지원 4주와 민간 연장, 첫째와 둘째 조리 비교",
    persona: "첫째 때 혼자 버틴 기억 때문에 둘째 때는 도움을 길게 받은 38살 엄마",
  },
  {
    type: "산후조리 실전형",
    keyword: "산후조리원 퇴소 후 루틴",
    note: "집에 온 뒤 수유, 식사, 잠, 남편 도움을 실제 루틴으로 정리",
    persona: "조리원 퇴소 첫날부터 집이 낯설고 수유 시간표에 매달리는 산후 3주 엄마",
  },
  {
    type: "산후 감정/번아웃형",
    keyword: "출산 후 우울감",
    note: "버티면 될 줄 알았는데 마음이 내 마음 같지 않은 상태",
    persona: "아기 울음보다 내가 무너지는 게 더 무서워진 산후 6주 엄마",
  },
  {
    type: "산후 감정/번아웃형",
    keyword: "독박육아 너무 힘들어요",
    note: "불안, 우울, 공황 의심까지 솔직하게 털어놓는 긴 자기고백",
    persona: "하루 종일 아무에게도 제대로 말 못 하고 새벽에 길게 글을 쓰는 산후 5개월 엄마",
  },
];

const COMMENT_CLUSTERS: CommentCluster[] = [
  {
    name: "질문/실전확인",
    instruction: `본댓글 [댓글1]~[댓글8]만 작성한다.
- 숫자, 기간, 병원 일정, 수치, 검사, 약 복용 질문 중심.
- "저", "저도", "저는", "저랑"으로 시작 금지.
- 시작 예시 리듬: "56일이면", "내막 5mm", "프로게스테론", "예약 잡을 때", "초음파에서", "생리 유도제", "배란 확인", "금요일 진료".
- 각 댓글은 1~3문장.`,
  },
  {
    name: "개인사연",
    instruction: `본댓글 [댓글9]~[댓글16]만 작성한다.
- 서로 다른 사람 8명의 개인 사연.
- 긴 댓글 4개, 중간 댓글 4개.
- "저", "저도", "저는", "저랑", "저희"로 시작 금지.
- 각 댓글은 반드시 아래 시작어 중 하나로 시작한다.
  [댓글9] 52일째였던 케이스인데요
  [댓글10] 소파술 후에는
  [댓글11] 자연배출 기다리던 기간에
  [댓글12] 첫 생리 양이
  [댓글13] 병원 두 군데에서
  [댓글14] 70일 넘긴 사람도
  [댓글15] 화학적 유산까지 겹치면
  [댓글16] 지금 아기 재우고
- 각 댓글은 서로 다른 타임라인을 가진다. 40일, 52일, 67일, 70일, 소파술, 자연배출, 병원 재방문, 첫 생리 양 변화 등을 나눠 쓴다.
- 말투는 담담한 사람, 급한 사람, 울컥한 사람, 정보형 사람을 섞는다.`,
  },
  {
    name: "짧은반응/생활장면",
    instruction: `본댓글 [댓글17]~[댓글24]만 작성한다.
- 짧은 반응 3개, 생활 장면 3개, 현실 조언 2개.
- 시작 문장은 서로 완전히 다르게 쓴다.
- "힘내세요"로 시작 금지.
- 병원 앱, 남편 손, 화장실 확인, 첫째 재우고 검색, 밤에 휴대폰 밝기 같은 생활 디테일을 섞는다.
- 각 댓글은 1~4문장.`,
  },
  {
    name: "답글대화",
    instruction: `답글만 작성한다. 본댓글은 만들지 않는다.
- [작성자-2], [작성자-3], [댓글러-3], [작성자-7], [제3자-8], [작성자-10], [댓글러-12], [작성자-14], [제3자-16], [작성자-18], [댓글러-21], [작성자-24] 형식으로 작성한다.
- 작성자 답글은 "맞아요", "감사해요" 반복 금지.
- 원댓글의 구체 디테일을 받아서 다르게 답한다.
- 댓글러/제3자 답글은 다른 경험을 짧게 추가하거나 후속 질문을 한다.`,
  },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getAuth = () =>
  new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

const cleanContent = (raw: string): string =>
  raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^>\s*/gm, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed)) return false;
      if (/^-{3,}$/.test(trimmed) || /^={3,}$/.test(trimmed)) return false;
      if (/^\([^)]*사진[^)]*\)$/.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const parseTitleAndBody = (content: string): ParsedBodyOnly | null => {
  const titleMatch = content.match(/\[제목\]\s*([\s\S]*?)(?=\n\s*\[본문\])/);
  const bodyMatch = content.match(/\[본문\]\s*([\s\S]*?)$/);

  if (!titleMatch || !bodyMatch) return null;

  const title = titleMatch[1].trim().split("\n").map((line) => line.trim()).filter(Boolean)[0] || "";
  const body = bodyMatch[1]
    .replace(/\[댓글\][\s\S]*$/g, "")
    .trim();

  if (!title || !body) return null;

  return { title, body };
};

const checkCommentDiversity = (comments: Array<{ type: string; content: string }>): CommentDiversityCheck => {
  const topComments = comments.filter((comment) => comment.type === "comment");
  if (topComments.length < 20) {
    return { ok: false, reason: `댓글 수 부족: ${topComments.length}` };
  }

  const firstTokens = topComments.map((comment) => comment.content.trim().slice(0, 8));
  const uniqueStarts = new Set(firstTokens).size;
  const firstPersonStarts = topComments.filter((comment) => /^(저|저도|저는|저랑|저희|저렇게)/.test(comment.content.trim())).length;
  const sympathyStarts = topComments.filter((comment) => /^(공감|힘내|마음|눈물|울컥)/.test(comment.content.trim())).length;

  if (firstPersonStarts > 5) {
    return { ok: false, reason: `1인칭 시작 과다: ${firstPersonStarts}` };
  }

  if (sympathyStarts > 4) {
    return { ok: false, reason: `공감 시작 과다: ${sympathyStarts}` };
  }

  if (uniqueStarts / topComments.length < 0.8) {
    return { ok: false, reason: `댓글 첫머리 중복 과다: ${uniqueStarts}/${topComments.length}` };
  }

  return { ok: true, reason: "ok" };
};

const buildPromptForCase = (item: KeywordCase): string => {
  const prompt = buildPregnancyReferencePrompt({
    keyword: item.keyword,
    ref: `이번 원고 타입: ${item.type}\n핵심 방향: ${item.note}\n이번 페르소나: ${item.persona}`,
  });

  return `${prompt}

## 이번 원고 필수 타입
${item.type}

## 이번 원고 핵심 방향
${item.note}

## 이번 원고 페르소나
${item.persona}

## 존댓말 고정
본문과 댓글 모두 존댓말로만 작성한다.
친근한 카페 말투는 허용하지만 반말 어미는 절대 금지한다.

위 타입과 핵심 방향을 본문과 댓글에 반드시 반영한다.`;
};

const buildBodyPromptForCase = (item: KeywordCase): string => `${buildPromptForCase(item)}

## 이번 요청 출력 제한
[댓글]은 절대 출력하지 않는다.
[제목]과 [본문]만 출력한다.

출력 형식:
[제목]
(한 줄)

[본문]
(2200~3600자)

바로 [제목]부터 시작.`;

const buildCommentPromptForCase = (item: KeywordCase, title: string, body: string): string => `${buildPromptForCase(item)}

## 생성된 원고
[제목]
${title}

[본문]
${body}

## 이번 요청 출력 제한
[제목]과 [본문]은 절대 다시 출력하지 않는다.
[댓글]만 출력한다.

댓글은 본문을 실제로 읽은 카페 회원들의 대화처럼 작성한다.
본문의 날짜, 회차, 병원 대화, 감정선을 구체적으로 받아서 질문/경험/답글을 만든다.

## 댓글 말투 다양화 강제
- 댓글러마다 완전히 다른 사람이어야 한다. 같은 사람이 여러 번 말하는 듯한 말투 금지.
- "저도", "저는", "맞아요", "힘내세요", "병원 가보세요"로 시작하는 댓글은 각각 최대 1개만 허용한다.
- 첫 문장은 질문형, 숫자 확인형, 경험담형, 생활 잡담형, 병원 비교형, 짧은 반응형이 섞여야 한다.
- 댓글 첫 8글자가 서로 겹치면 실패다.
- 짧은 댓글 5~8개, 긴 사연 댓글 5~7개, 중간 길이 질문 댓글 8~12개를 섞는다.
- 감정 온도는 울컥함, 담담함, 급함, 조심스러움, 현실적인 피곤함, 정보 확인 욕구로 분산한다.
- 작성자 답글도 복붙처럼 "감사해요/맞아요"만 반복하지 말고, 각 댓글의 디테일을 받아서 다르게 대답한다.
- 댓글러끼리의 재답글은 실제 대화처럼 엇갈린 경험, 추가 질문, 짧은 동의를 섞는다.

## 댓글 번호별 시작 방식
- [댓글1] 숫자/기간 확인으로 시작
- [댓글2] 본문 수치나 병원 소견 질문으로 시작
- [댓글3] 특정 장면 반응으로 시작
- [댓글4] 병원에서 다르게 들은 말 비교로 시작
- [댓글5] 짧은 한 줄 반응으로 시작
- [댓글6] 가족/남편/첫째 관련 생활 장면으로 시작
- [댓글7] 검사명/약명/호르몬 질문으로 시작
- [댓글8] 본인 타임라인 공유로 시작하되 "저"로 시작 금지
- [댓글9] 다른 댓글러에게 묻는 말로 시작
- [댓글10] 비용/예약/대기시간 같은 현실 문제로 시작
- 이후 댓글도 위 시작 방식을 순환하되 같은 첫 단어 반복 금지

출력 형식:
[댓글]
(26~36개, 각 줄은 [댓글N]/[작성자-N]/[댓글러-N]/[제3자-N] 태그로 시작)

바로 [댓글]부터 시작.`;

const buildCommentRetryPrompt = (
  item: KeywordCase,
  title: string,
  body: string,
  previousReason: string,
): string => `${buildCommentPromptForCase(item, title, body)}

## 재작성 사유
이전 댓글은 ${previousReason} 문제로 실패했다.

## 이번 재작성 추가 금지
- [댓글] 본댓글 중 "저", "저도", "저는", "저랑", "저희"로 시작하는 댓글은 총 3개 이하.
- 공감문으로 시작하는 댓글은 총 2개 이하.
- 반드시 숫자 확인, 병원 비교, 생활 장면, 짧은 질문, 댓글러끼리 대화 시작을 섞는다.
- 이전과 비슷한 댓글 구조를 반복하지 않는다.`;

const buildCommentClusterPrompt = (
  item: KeywordCase,
  title: string,
  body: string,
  cluster: CommentCluster,
): string => `${buildPromptForCase(item)}

## 생성된 원고
[제목]
${title}

[본문]
${body}

## 이번 댓글 묶음
${cluster.name}

## 묶음별 지시
${cluster.instruction}

## 공통 댓글 규칙
- [제목]과 [본문]은 다시 출력하지 않는다.
- [댓글] 헤더도 출력하지 않는다. 요청한 댓글 태그 줄만 출력한다.
- 모든 문장은 존댓말로 작성한다.
- 닉네임 금지. 태그만 사용한다.
- 같은 시작 문장 반복 금지.
- 광고, 제품명, 병원명 공개 요구 금지.

바로 요청한 댓글 태그부터 시작.`;

const callGenerator = async (prompt: string): Promise<{ content: string; model: string; elapsed: number }> => {
  const response = await fetch(`${CONTENT_API}/generate/test/cafe-daily`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model: MODEL }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  return {
    content: String(json.content || json.comment || ""),
    model: String(json.model || MODEL),
    elapsed: Number(json.elapsed || 0),
  };
};

const resetSheet = async () => {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `'${OUT_TAB}'!A:Z`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${OUT_TAB}'!A1:K1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "타입",
        "키워드",
        "제목",
        "본문",
        "댓글",
        "댓글수",
        "모델",
        "프롬프트버전",
        "생성일",
        "상태",
        "메모",
      ]],
    },
  });
};

const appendRows = async (rows: (string | number)[][]) => {
  if (rows.length === 0) return;
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${OUT_TAB}'!A:K`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
};

const processOne = async (item: KeywordCase, index: number, total: number) => {
  const started = Date.now();
  console.log(`[${index + 1}/${total}] ${item.type} / ${item.keyword} 생성 시작`);

  try {
    const bodyPrompt = buildBodyPromptForCase(item);
    const bodyGenerated = await callGenerator(bodyPrompt);
    const bodyContent = cleanContent(bodyGenerated.content);
    const bodyParsed = parseTitleAndBody(bodyContent);
    const today = new Date().toISOString().slice(0, 10);

    if (!bodyParsed) {
      console.log(`[${index + 1}/${total}] ${item.keyword} 본문 파싱 실패`);
      return [
        item.type,
        item.keyword,
        "[파싱실패]",
        bodyContent.slice(0, 45000),
        "",
        0,
        bodyGenerated.model,
        PROMPT_VERSION,
        today,
        "본문파싱실패",
        item.note,
      ];
    }

    const title = bodyParsed.title;
    const body = cleanContent(bodyParsed.body);
    const commentParts: string[] = [];
    let commentModel = bodyGenerated.model;
    for (const cluster of COMMENT_CLUSTERS) {
      const generated = await callGenerator(buildCommentClusterPrompt(item, title, body, cluster));
      commentModel = generated.model;
      commentParts.push(cleanContent(generated.content).replace(/^\[댓글\]\s*/g, "").trim());
      await sleep(300);
    }

    let commentContent = `[댓글]\n${commentParts.join("\n")}`;
    let combinedContent = `[제목]\n${title}\n\n[본문]\n${body}\n\n${commentContent}`;
    let parsed = parseViralResponse(combinedContent);

    if (parsed) {
      const diversity = checkCommentDiversity(parsed.comments);
      if (!diversity.ok) {
        console.log(`[${index + 1}/${total}] ${item.keyword} 댓글 다양성 미흡: ${diversity.reason}`);
      }
    } else {
      console.log(`[${index + 1}/${total}] ${item.keyword} 댓글 파싱 실패, 단일 재시도`);
      const retryGenerated = await callGenerator(buildCommentRetryPrompt(item, title, body, "묶음 댓글 파싱 실패"));
      commentModel = retryGenerated.model;
      commentContent = cleanContent(retryGenerated.content);
      combinedContent = `[제목]\n${title}\n\n[본문]\n${body}\n\n${commentContent}`;
      parsed = parseViralResponse(combinedContent);
    }

    if (!parsed) {
      console.log(`[${index + 1}/${total}] ${item.keyword} 댓글 파싱 실패`);
      return [
        item.type,
        item.keyword,
        title,
        body,
        commentContent.slice(0, 45000),
        0,
        commentModel,
        PROMPT_VERSION,
        today,
        "댓글파싱실패",
        item.note,
      ];
    }

    const comments = formatComments(JSON.stringify(parsed.comments));
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[${index + 1}/${total}] ${item.keyword} 완료 ${seconds}s / 댓글 ${parsed.comments.length}개`);

    return [
      item.type,
      item.keyword,
      title,
      body,
      comments,
      parsed.comments.length,
      commentModel,
      PROMPT_VERSION,
      today,
      "완료",
      item.note,
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[${index + 1}/${total}] ${item.keyword} API 실패: ${message}`);
    return [
      item.type,
      item.keyword,
      "[API실패]",
      message.slice(0, 45000),
      "",
      0,
      MODEL,
      PROMPT_VERSION,
      new Date().toISOString().slice(0, 10),
      "API실패",
      item.note,
    ];
  }
};

const main = async () => {
  const targets = LIMIT > 0 ? KEYWORD_CASES.slice(0, LIMIT) : KEYWORD_CASES;
  console.log(`대상 탭: ${OUT_TAB}`);
  console.log(`모델: ${MODEL}`);
  console.log(`처리 대상: ${targets.length}개`);

  await resetSheet();

  const rows: (string | number)[][] = [];
  for (let i = 0; i < targets.length; i++) {
    const row = await processOne(targets[i], i, targets.length);
    rows.push(row);
    await appendRows([row]);
    if (i < targets.length - 1) {
      await sleep(SLEEP_MS);
    }
  }

  const ok = rows.filter((row) => row[9] === "완료").length;
  const failed = rows.length - ok;
  console.log(`완료: ${ok} / 실패: ${failed}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
