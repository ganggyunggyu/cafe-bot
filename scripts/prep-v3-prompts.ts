import dotenv from "dotenv";
dotenv.config({ path: "/Users/ganggyunggyu/Programing/naver-search-engine/.env" });
dotenv.config({ path: ".env" });
import { mkdirSync, writeFileSync } from "fs";
import { buildPregnancyInfoV3Prompt } from "./build-pregnancy-info-v3-prompt";

const OUT_DIR = "/tmp/v3-prompts";
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";

// 시드 + 서브키워드 = 사용자 예시("계류유산 회복")처럼 새 키워드 구성
const KEYWORDS: string[] = [
  "자궁경부확대경검사 결과",
  "노산임신 준비",
  "임신검사 종류",
  "임신15주차 태동",
  "계류유산 회복",
  "임신확인시기 테스트기",
  "임신초기 갈색냉 양",
  "임신9주차 입덧",
  "임신12주차 안정기",
  "임신전검사 항목",
  "신혼부부 산전검사 무료",
  "임신9주차 초음파",
  "임신초기 어지러움 빈혈",
  "임신10주차 피로",
  "임신초기 입덧 음식",
  "임신 산전검사 시기",
  "임신8주차 출혈",
  "임신초기 변비 음식",
  "산전검사 보건소",
  "자연분만 회음부 회복",
];

const stripHtml = (s: string): string =>
  s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

const PROMO_HINTS = ["광고", "공구", "이벤트", "할인", "구매", "판매", "추천 제품"];

const searchCafeArticles = async (kw: string) => {
  if (!NAVER_CLIENT_ID) return [];
  const url = `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent(
    kw
  )}&display=10&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) return [];
  const j: any = await res.json();
  return (j.items || []).map((it: any) => ({
    title: stripHtml(it.title || ""),
    description: stripHtml(it.description || ""),
  }));
};

const buildRef = (arts: { title: string; description: string }[]) => {
  const filtered = arts.filter((a) => {
    const t = `${a.title} ${a.description}`;
    return !PROMO_HINTS.some((p) => t.includes(p));
  });
  return filtered
    .slice(0, 5)
    .map((a, i) => `[참고${i + 1}] ${a.title}\n${a.description}`)
    .join("\n\n");
};

const main = async () => {
  mkdirSync(OUT_DIR, { recursive: true });

  const manifest: { idx: number; keyword: string; promptFile: string; outFile: string; refCount: number; promptLen: number }[] = [];

  for (let i = 0; i < KEYWORDS.length; i++) {
    const kw = KEYWORDS[i];
    const arts = await searchCafeArticles(kw);
    const ref = buildRef(arts);
    const prompt = buildPregnancyInfoV3Prompt({ keyword: kw, ref });
    const idx = String(i + 1).padStart(2, "0");
    const safeKw = kw.replace(/\s+/g, "_");
    const promptFile = `${OUT_DIR}/${idx}-${safeKw}.prompt.md`;
    const outFile = `${OUT_DIR}/${idx}-${safeKw}.output.txt`;
    writeFileSync(promptFile, prompt);
    manifest.push({ idx: i + 1, keyword: kw, promptFile, outFile, refCount: arts.length, promptLen: prompt.length });
    console.log(`[${idx}] ${kw} (ref ${arts.length}건, prompt ${prompt.length}자)`);
    await new Promise((r) => setTimeout(r, 200));
  }

  writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`\n✓ manifest 작성: ${OUT_DIR}/manifest.json`);
};

main().catch((e) => { console.error(e); process.exit(1); });
