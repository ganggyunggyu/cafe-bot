import dotenv from "dotenv";
dotenv.config({ path: "/Users/ganggyunggyu/Programing/naver-search-engine/.env" });
dotenv.config({ path: ".env" });
import { google } from "googleapis";
import crypto from "crypto";

const AD_API_KEY = process.env.NAVER_AD_API_KEY!;
const AD_SECRET = process.env.NAVER_AD_SECRET_KEY!;
const AD_CUSTOMER = process.env.NAVER_AD_CUSTOMER_ID!;

const SHEET_ID = "1gyipTIEogC9Qopj8w3ggBmD0k5KvAw6yNdIMXQDnwms";
const TAB = "카페키워드_클로드";

const SEED_KEYWORDS = [
  "노산임신",
  "임신12주차증상",
  "계류유산원인",
  "임테기진하기",
  "임신7주차증상",
  "임신초기변비",
  "35세임신",
  "자연분만회복",
  "착상통위치",
  "입덧시작시기",
  "임신초기갈색냉",
  "임신5주차증상",
  "고위험임신",
  "임산부잠자세",
  "계류유산후임신",
  "임신9주차증상",
  "임신초기어지러움",
  "모유수유시작",
  "임신16주차증상",
  "노산출산위험",
  "임신초기입덧",
  "착상혈시기",
  "임신6주차증상",
  "임산부운동",
  "계류유산증상",
  "임신4주차증상",
  "임신확인시기",
  "임신8주차증상",
  "40대임신",
  "제왕절개회복",
  "임산부카페인",
  "입덧끝나는시기",
  "임신초기증상",
  "임신10주차증상",
  "태동시작시기",
];

const sign = (timestamp: string, method: string, uri: string) => {
  const message = `${timestamp}.${method}.${uri}`;
  return crypto.createHmac("sha256", AD_SECRET).update(message).digest("base64");
};

interface KeywordRow {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  plAvgDepth: number;
  compIdx: string;
}

const fetchRelatedKeywords = async (hint: string): Promise<KeywordRow[]> => {
  const cleanHint = hint.replace(/\s+/g, "");
  const uri = "/keywordstool";
  const method = "GET";
  const timestamp = Date.now().toString();
  const signature = sign(timestamp, method, uri);
  const url = `https://api.searchad.naver.com${uri}?hintKeywords=${encodeURIComponent(cleanHint)}&showDetail=1`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": AD_API_KEY,
      "X-Customer": AD_CUSTOMER,
      "X-Signature": signature,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`[${hint}] ${res.status}: ${txt.slice(0, 200)}`);
    return [];
  }
  const json: any = await res.json();
  return json.keywordList || [];
};

const toNum = (v: number | string): number => {
  const n = typeof v === "string" ? parseInt(v.replace(/[^0-9]/g, ""), 10) : v;
  return Number.isFinite(n) ? n : 0;
};

const main = async () => {
  console.log("=== 임신 관련 키워드 수집 ===");
  const all = new Map<string, KeywordRow>();

  for (const seed of SEED_KEYWORDS) {
    const rows = await fetchRelatedKeywords(seed);
    console.log(`[${seed}] ${rows.length}개 연관 키워드`);
    for (const r of rows) {
      if (!all.has(r.relKeyword)) all.set(r.relKeyword, r);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  const PREGNANCY_TERMS = [
    "임신", "유산", "착상", "배란", "임테기", "태동", "입덧",
    "산모", "임산부", "초음파", "출산", "자궁", "산후", "태아",
    "임당", "양수", "분만", "역아", "산전", "임테스트", "임테기",
    "조산", "진통", "산통", "출혈", "양막",
  ];

  const INFO_TERMS = [
    "원인", "증상", "이유", "시기", "주수", "주차", "차이", "통증",
    "색깔", "횟수", "가능성", "확률", "위험", "예방",
    "방법", "회복", "검사", "자가진단", "후", "전조", "징조",
    "기간", "관리", "주의", "음식", "운동", "잠", "자세",
    "구분", "지속", "느낌", "체크", "갈색", "분홍", "황색",
    "심함", "기형", "변비", "어지러", "두통", "메스꺼",
    "초기", "중기", "후기", "노산", "고령", "위험",
  ];

  const EXCLUDE_TERMS = [
    "영양제", "비타민", "엽산", "철분", "추천", "한의원", "한약",
    "병원", "가격", "선물", "보험", "도시락", "비교",
    "베스트", "약", "프로바이오틱스", "유산균", "마그네슘",
    "오메가", "DHA", "종합", "올인원", "활성", "이노시톨",
    "고함량", "유기농", "남성", "남자", "아연", "산부인과",
    "내막증", "근종", "선근증", "이형성증", "경부암", "자궁암",
    "자궁출혈", "주사", "선물세트", "쿠팡", "할인", "구매",
    "판매", "사용법", "외도", "질외사정", "낙태", "임신중절",
    "산모카드", "임신확인서", "필라테스", "조리원", "양천구",
    "강남", "송파", "분당", "마사지", "산후도우미",
  ];

  const isPregnancy = (kw: string) =>
    PREGNANCY_TERMS.some((t) => kw.includes(t));
  const hasInfoIntent = (kw: string) =>
    INFO_TERMS.some((t) => kw.includes(t));
  const isExcluded = (kw: string) =>
    EXCLUDE_TERMS.some((t) => kw.includes(t));

  const candidates = Array.from(all.values())
    .filter((r) => isPregnancy(r.relKeyword))
    .filter((r) => hasInfoIntent(r.relKeyword))
    .filter((r) => !isExcluded(r.relKeyword))
    .map((r) => ({
      keyword: r.relKeyword,
      pc: toNum(r.monthlyPcQcCnt),
      mo: toNum(r.monthlyMobileQcCnt),
      total: toNum(r.monthlyPcQcCnt) + toNum(r.monthlyMobileQcCnt),
      comp: r.compIdx,
    }))
    .filter((r) => r.total >= 100 && r.total <= 2000)
    .sort((a, b) => a.total - b.total);

  console.log(`\n=== 1차 후보 (월간 100~2000) ${candidates.length}개 ===`);
  for (const c of candidates.slice(0, 80)) {
    console.log(`  ${c.keyword} (PC:${c.pc} / MO:${c.mo} / 합:${c.total} / 경쟁:${c.comp})`);
  }

  const SUB_KEYWORDS = ["시기", "기간", "방법", "초기", "후기", "원인", "증상", "관리"];
  const highVolume = Array.from(all.values())
    .filter((r) => isPregnancy(r.relKeyword))
    .filter((r) => hasInfoIntent(r.relKeyword))
    .filter((r) => !isExcluded(r.relKeyword))
    .map((r) => ({
      keyword: r.relKeyword,
      total: toNum(r.monthlyPcQcCnt) + toNum(r.monthlyMobileQcCnt),
    }))
    .filter((r) => r.total > 2000 && r.total <= 8000)
    .slice(0, 15);

  console.log(`\n=== 1500+ 키워드 서브 붙여서 재검증 ===`);
  const augmented: typeof candidates = [];
  for (const hv of highVolume) {
    for (const sub of SUB_KEYWORDS) {
      const newKw = `${hv.keyword}${sub}`;
      const rows = await fetchRelatedKeywords(newKw);
      const match = rows.find((r) => r.relKeyword === newKw);
      if (!match) continue;
      const pc = toNum(match.monthlyPcQcCnt);
      const mo = toNum(match.monthlyMobileQcCnt);
      const total = pc + mo;
      if (total >= 100 && total <= 1500 && !isExcluded(newKw)) {
        console.log(`  + ${newKw} (합:${total})`);
        augmented.push({ keyword: newKw, pc, mo, total, comp: match.compIdx });
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const merged = [...candidates, ...augmented];
  const dedup = new Map<string, typeof candidates[0]>();
  for (const c of merged) {
    if (!dedup.has(c.keyword)) dedup.set(c.keyword, c);
  }
  const pool = Array.from(dedup.values());
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 20);

  console.log(`\n=== 시트 기록 (${selected.length}개) ===`);
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const header = [["키워드", "PC 월간검색량", "모바일 월간검색량", "합계", "경쟁정도", "수집일"]];
  const today = new Date().toISOString().split("T")[0];
  const rows = selected.map((c) => [c.keyword, c.pc, c.mo, c.total, c.comp, today]);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A:Z`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [...header, ...rows] },
  });

  console.log(`✅ ${TAB} 탭에 ${selected.length}개 기록 완료`);
};

main().catch((e) => { console.error(e); process.exit(1); });
