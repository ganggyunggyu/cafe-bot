import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { buildOwnKeywordPrompt } from "../src/features/viral/prompts/build-own-keyword-prompt";
import { buildCompetitorAdvocacyPrompt } from "../src/features/viral/prompts/build-competitor-advocacy-prompt";

interface ModifyItem {
  link: string;
  keyword: string;
  keywordType?: "own" | "competitor";
}

interface ManuscriptItem {
  articleId: number;
  keyword: string;
  raw: string;
}

const INPUT_FILE = process.env.MODIFY_SCHEDULE_FILE || "/tmp/chanel-modify-2026-04-13.json";
const OUTPUT_FILE = process.env.MANUSCRIPTS_FILE || "/tmp/generated-manuscripts-claude-cli.json";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const MAX_RETRIES = parseInt(process.env.CLAUDE_RETRIES || "2", 10);

const parseArticleId = (link: string): number => {
  const match = link.match(/articles\/(\d+)/);
  if (!match) {
    throw new Error(`articleId parse failed: ${link}`);
  }

  return parseInt(match[1], 10);
};

const buildPrompt = (item: ModifyItem): string => {
  if (item.keywordType === "competitor") {
    return buildCompetitorAdvocacyPrompt({
      keyword: item.keyword,
      keywordType: "competitor",
    });
  }

  return buildOwnKeywordPrompt({
    keyword: item.keyword,
    keywordType: "own",
  });
};

const isValidRaw = (raw: string): boolean => {
  return raw.includes("[제목]") && raw.includes("[본문]") && raw.includes("[댓글");
};

const generateWithClaude = (prompt: string): string => {
  const result = spawnSync(
    "claude",
    [
      "-p",
      "--model",
      MODEL,
      prompt,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    const errorMessage = result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`;
    throw new Error(errorMessage);
  }

  return result.stdout.trim();
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const main = async (): Promise<void> => {
  const items = JSON.parse(readFileSync(INPUT_FILE, "utf8")) as ModifyItem[];
  const manuscripts: ManuscriptItem[] = [];

  console.log(`입력 ${items.length}건`);
  console.log(`모델 ${MODEL}`);
  console.log(`출력 ${OUTPUT_FILE}\n`);

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const articleId = parseArticleId(item.link);
    const prompt = buildPrompt(item);

    console.log(`[${index + 1}/${items.length}] #${articleId} ${item.keyword} (${item.keywordType || "own"})`);

    let raw = "";
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        raw = generateWithClaude(prompt);
        if (!isValidRaw(raw)) {
          throw new Error("raw manuscript format invalid");
        }
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.log(`  실패 ${attempt}/${MAX_RETRIES + 1}: ${lastError}`);

        if (attempt <= MAX_RETRIES) {
          await sleep(2000 * attempt);
        }
      }
    }

    if (!raw) {
      throw new Error(`#${articleId} ${item.keyword} 생성 실패: ${lastError}`);
    }

    manuscripts.push({
      articleId,
      keyword: item.keyword,
      raw,
    });

    writeFileSync(OUTPUT_FILE, JSON.stringify(manuscripts, null, 2));
    console.log(`  저장 완료\n`);
  }

  console.log(`완료: ${manuscripts.length}건`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
