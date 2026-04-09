#!/usr/bin/env node

import { spawn } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PROJECT_ROOT = resolve(__dirname, "..");
export const LOCAL_BIN_DIR = join(PROJECT_ROOT, "node_modules", ".bin");

export const buildProjectRootPath = (pathValue = "") => {
  const segments = pathValue
    .split(delimiter)
    .filter(Boolean)
    .filter((segment) => segment !== LOCAL_BIN_DIR);

  return [LOCAL_BIN_DIR, ...segments].join(delimiter);
};

export const buildProjectRootEnv = (env = process.env) => ({
  ...env,
  PATH: buildProjectRootPath(env.PATH ?? ""),
  VIRO_PROJECT_ROOT: PROJECT_ROOT,
});

export const buildProjectRootSpawnOptions = (env = process.env) => ({
  cwd: PROJECT_ROOT,
  env: buildProjectRootEnv(env),
  stdio: "inherit",
});

export const runWithProjectRoot = (command, args = []) => {
  if (!command) {
    throw new Error("command is required");
  }

  const child = spawn(command, args, buildProjectRootSpawnOptions(process.env));

  child.on("error", (error) => {
    console.error(
      `[project-root] failed to launch ${command}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  return child;
};

const main = () => {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    console.error(
      "[project-root] Usage: node scripts/run-with-project-root.mjs <command> [args...]"
    );
    process.exit(1);
  }

  if (process.cwd() !== PROJECT_ROOT) {
    console.log(`[project-root] correcting cwd: ${process.cwd()} -> ${PROJECT_ROOT}`);
  }

  runWithProjectRoot(command, args);
};

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
