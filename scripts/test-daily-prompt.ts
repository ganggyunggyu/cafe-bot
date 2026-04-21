/**
 * 일상글 프롬프트 테스트 — 자연스러움 검증용
 * Usage: npx tsx --env-file=.env.local scripts/test-daily-prompt.ts [model] [outFile]
 */
import { generateViralContent } from "@/shared/api/content-api";
import { buildShortDailyPrompt } from "@/features/viral/prompts/build-short-daily-prompt";
import { parseViralResponse } from "@/features/viral/viral-parser";
import * as fs from "fs";

const TEST_KEYWORDS = [
  "교촌치킨 허니콤보 시켰는데 양념이 더 맛있음",
  "21세기 대군부인 보면서 라면 끓이는 월요일 밤",
  "월간남친 보면서 떡볶이 시켜먹는 월요일 오후",
  "쿠팡 로켓배송 다이슨 에어랩 장바구니에 또 담음",
  "올리브영 4월 세일 바디미스트 5개 질러버림",
  "디올 새들백 미니 vs 미디움 사이즈 고민",
  "에르메스 가든파티 36 스트라이프 매장 재고",
];

const main = async () => {
  const model = process.argv[2] || "claude-sonnet-4-6";
  const outFile = process.argv[3] || `/tmp/daily-test-${Date.now()}.md`;

  console.log(`모델: ${model}`);
  console.log(`출력: ${outFile}\n`);

  const results: string[] = [`# 일상글 테스트 (${model})\n`];

  for (const keyword of TEST_KEYWORDS) {
    process.stdout.write(`[${keyword.slice(0, 30)}...] `);
    try {
      const prompt = buildShortDailyPrompt({ keyword, keywordType: "own" });
      const { content } = await generateViralContent({ prompt, model });
      const parsed = parseViralResponse(content);

      results.push(`---\n## 키워드: ${keyword}\n`);
      results.push(`### 제목\n${parsed?.title || "(파싱실패)"}\n`);
      results.push(`### 본문\n${parsed?.body || "(파싱실패)"}\n`);
      if (parsed?.comments?.length) {
        results.push(`### 댓글 (${parsed.comments.length}개)`);
        for (const c of parsed.comments) {
          results.push(`- [${c.role}${c.replyTo ? `→${c.replyTo}` : ""}] ${c.text}`);
        }
        results.push("");
      }
      console.log("✅");
    } catch (e) {
      console.log(`❌ ${e instanceof Error ? e.message : e}`);
      results.push(`---\n## 키워드: ${keyword}\n`);
      results.push(`### ❌ 생성 실패\n${e instanceof Error ? e.message : e}\n`);
    }
  }

  fs.writeFileSync(outFile, results.join("\n"), "utf-8");
  console.log(`\n✅ 결과 저장: ${outFile}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
