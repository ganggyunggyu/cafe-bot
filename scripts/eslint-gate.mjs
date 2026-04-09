import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDiffTargets, normalizeLintableFiles } from "./eslint-gate-lib.mjs";

const require = createRequire(import.meta.url);

const getGitOutput = (args) => {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

const resolveBaseRef = () => {
  if (process.env.ESLINT_GATE_BASE) {
    return process.env.ESLINT_GATE_BASE;
  }

  const githubBaseRef = process.env.GITHUB_BASE_REF;

  if (!githubBaseRef) {
    return "";
  }

  const remoteBaseRef = `origin/${githubBaseRef}`;
  const remoteExists = getGitOutput(["rev-parse", "--verify", remoteBaseRef]);

  return remoteExists ? remoteBaseRef : githubBaseRef;
};

const getChangedFiles = (baseRef) => {
  const diffTargets = getDiffTargets(baseRef);
  const changedFiles = diffTargets.flatMap((args) => {
    const output = getGitOutput(args);

    return output ? output.split("\n") : [];
  });

  return normalizeLintableFiles(changedFiles);
};

const explicitFiles = normalizeLintableFiles(process.argv.slice(2));
const changedFiles = explicitFiles.length > 0 ? explicitFiles : getChangedFiles(resolveBaseRef());

if (changedFiles.length === 0) {
  console.log("[lint-gate] No changed JS/TS files to lint.");
  process.exit(0);
}

console.log(`[lint-gate] Linting ${changedFiles.length} changed file(s).`);

const eslintPackageJsonPath = require.resolve("eslint/package.json");
const eslintBin = join(dirname(eslintPackageJsonPath), "bin", "eslint.js");
const result = spawnSync(
  process.execPath,
  [eslintBin, "--max-warnings=0", "--no-warn-ignored", ...changedFiles],
  {
    cwd: process.cwd(),
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
