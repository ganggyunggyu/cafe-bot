import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHarnessVerifySteps,
  buildStrictLintCommand,
  parseHarnessVerifyArgs,
} from './harness-verify';

test('parseHarnessVerifyArgs requires lint targets when lint is enabled', () => {
  assert.throws(
    () => parseHarnessVerifyArgs([
      '--test',
      'npm run test:harness',
    ]),
    /최소 1개의 --lint-target/,
  );
});

test('parseHarnessVerifyArgs requires at least one targeted test command', () => {
  assert.throws(
    () => parseHarnessVerifyArgs([
      '--lint-target',
      'scripts/harness-verify.ts',
    ]),
    /최소 1개의 --test/,
  );
});

test('buildStrictLintCommand builds zero-warning eslint command for explicit targets', () => {
  assert.equal(
    buildStrictLintCommand([
      'scripts/harness-verify.ts',
      'scripts/harness-verify.test.ts',
    ]),
    "npm run lint:strict -- 'scripts/harness-verify.ts' 'scripts/harness-verify.test.ts'",
  );
});

test('buildHarnessVerifySteps includes strict lint, harness, tests, verify, and commit steps in order', () => {
  const options = parseHarnessVerifyArgs([
    '--lint-target',
    'scripts/harness-verify.ts',
    '--lint-target',
    'scripts/harness-verify.test.ts',
    '--test',
    'npm run test:harness',
    '--verify',
    'npm run build',
    '--commit',
    'test: verify harness flow',
  ]);

  const steps = buildHarnessVerifySteps(options);

  assert.deepEqual(
    steps.map(({ label }) => label),
    ['lint:strict', 'harness', 'test:1', 'verify:1', 'git-status', 'commit'],
  );
  assert.equal(
    steps[0]?.command,
    "npm run lint:strict -- 'scripts/harness-verify.ts' 'scripts/harness-verify.test.ts'",
  );
  assert.equal(steps.at(-1)?.command, "git commit -m 'test: verify harness flow'");
});

test('buildHarnessVerifySteps respects no-lint and no-harness flags', () => {
  const options = parseHarnessVerifyArgs([
    '--no-lint',
    '--no-harness',
    '--test',
    'npx tsx --test src/features/viral/viral-batch-ui.helpers.test.ts',
  ]);

  const steps = buildHarnessVerifySteps(options);

  assert.deepEqual(
    steps.map(({ label }) => label),
    ['test:1'],
  );
});
