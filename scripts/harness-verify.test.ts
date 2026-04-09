import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHarnessVerifySteps,
  parseHarnessVerifyArgs,
} from './harness-verify';

test('parseHarnessVerifyArgs requires at least one targeted test command', () => {
  assert.throws(
    () => parseHarnessVerifyArgs([]),
    /최소 1개의 --test/,
  );
});

test('buildHarnessVerifySteps includes lint, harness, tests, verify, and commit steps in order', () => {
  const options = parseHarnessVerifyArgs([
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
    ['lint', 'harness', 'test:1', 'verify:1', 'git-status', 'commit'],
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
