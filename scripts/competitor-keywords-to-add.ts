import * as fs from "fs";

// 사용된 키워드 로드
const usedRaw = fs.readFileSync("scripts/keywords/used-keywords.txt", "utf-8");
const usedSet = new Set(usedRaw.split("\n").map(l => l.trim()).filter(Boolean));

const brands = [
  // 기존 + 신규 브랜드
  { name: "이경제 흑염소 진액", short: "이경제" },
  { name: "김오곤 흑염소 진액", short: "김오곤" },
  { name: "설운도 진생록", short: "설운도" },
  { name: "산너미목장 흑염소", short: "산너미목장" },
  { name: "매포흑염소목장", short: "매포흑염소" },
  { name: "한살림 흑염소진액", short: "한살림" },
  { name: "천호엔케어 흑염소진액", short: "천호엔케어" },
  { name: "GNM자연의품격 흑염소진액", short: "GNM" },
  { name: "CMG제약 본래원 흑염소진액", short: "CMG제약" },
  { name: "뉴트리원라이프 흑염소진액", short: "뉴트리원" },
  { name: "건국 흑염소진액 골드", short: "건국" },
  { name: "보령 흑염소진액", short: "보령" },
  { name: "팔도감 흑염소진액", short: "팔도감" },
  { name: "공앤진 흑염소진액", short: "공앤진" },
  { name: "한비담 흑염소진액", short: "한비담" },
  { name: "흑진담 흑염소진액", short: "흑진담" },
  { name: "흑담만 가지산흑염소", short: "흑담만" },
  { name: "지리산마천농협 흑염소진액", short: "마천농협" },
  { name: "괴산흑염소 진액", short: "괴산흑염소" },
  { name: "솔미농장 흑염소진액", short: "솔미농장" },
  { name: "참앤들황토농원 흑염소진액", short: "황토농원" },
  { name: "즙쟁이 흑염소진액", short: "즙쟁이" },
  { name: "내추럴박스 흑염소진액", short: "내추럴박스" },
];

const suffixes = ["", " 후기", " 가격", " 효능"];

const keywords: { keyword: string; brand: string }[] = [];

for (const brand of brands) {
  for (const suffix of suffixes) {
    const kw = brand.name + suffix;
    if (!usedSet.has(kw) && !usedSet.has(kw.replace(/ /g, ""))) {
      keywords.push({ keyword: kw, brand: brand.short });
    }
  }
}

// TSV 출력 (시트에 바로 복붙 가능)
console.log("키워드\t카페명(브랜드)\t노출구좌\t노출 유/무");
for (const { keyword, brand } of keywords) {
  console.log(`${keyword}\t${brand}\t신로직\tO`);
}
console.error(`\n총 ${keywords.length}개 타사 키워드 (사용된 키워드 제외)`);
