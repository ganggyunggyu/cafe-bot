import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import test from "node:test";

import {
  LOCAL_BIN_DIR,
  PROJECT_ROOT,
  buildProjectRootEnv,
  buildProjectRootPath,
  buildProjectRootSpawnOptions,
} from "./run-with-project-root.mjs";

test("PROJECT_ROOT resolves to the cafe-bot repository root", () => {
  assert.equal(basename(PROJECT_ROOT), "cafe-bot");
  assert.equal(existsSync(join(PROJECT_ROOT, "package.json")), true);
  assert.equal(existsSync(join(PROJECT_ROOT, "src")), true);
});

test("buildProjectRootPath prepends the local bin directory once", () => {
  const initialPath = ["/usr/bin", LOCAL_BIN_DIR, "/bin"].join(":");

  assert.equal(
    buildProjectRootPath(initialPath),
    [LOCAL_BIN_DIR, "/usr/bin", "/bin"].join(":")
  );
});

test("buildProjectRootEnv pins PATH and exposes VIRO_PROJECT_ROOT", () => {
  const env = buildProjectRootEnv({ PATH: "/usr/bin" });

  assert.equal(env.VIRO_PROJECT_ROOT, PROJECT_ROOT);
  assert.equal(env.PATH.startsWith(`${LOCAL_BIN_DIR}:`), true);
});

test("buildProjectRootSpawnOptions always runs commands from the repository root", () => {
  const options = buildProjectRootSpawnOptions({ PATH: "/usr/bin" });

  assert.equal(options.cwd, PROJECT_ROOT);
  assert.equal(options.env.VIRO_PROJECT_ROOT, PROJECT_ROOT);
});
