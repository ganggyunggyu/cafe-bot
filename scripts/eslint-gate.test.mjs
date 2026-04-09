import assert from "node:assert/strict";
import test from "node:test";
import { getDiffTargets, normalizeLintableFiles } from "./eslint-gate-lib.mjs";

test("normalizeLintableFiles keeps only unique lintable source files", () => {
  const files = normalizeLintableFiles([
    "src/app/page.tsx",
    "src/app/page.tsx",
    "scripts/run.mjs",
    "docs/HARNESS_ENGINEERING.md",
    ".next/server/app.js",
    "coverage/index.js",
    "src/styles.css",
  ]);

  assert.deepEqual(files, [
    "scripts/run.mjs",
    "src/app/page.tsx",
  ]);
});

test("getDiffTargets uses a merge-base range when base ref exists", () => {
  const targets = getDiffTargets("origin/main");

  assert.deepEqual(targets, [[
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    "origin/main...HEAD",
  ]]);
});

test("getDiffTargets falls back to working tree checks without a base ref", () => {
  const targets = getDiffTargets("");

  assert.deepEqual(targets, [
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    ["diff", "--name-only", "--cached", "--diff-filter=ACMR"],
    ["ls-files", "--others", "--exclude-standard"],
  ]);
});
