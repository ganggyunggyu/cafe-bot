import { spawnSync } from 'node:child_process';

export interface HarnessVerifyOptions {
  lintTargets: string[];
  testCommands: string[];
  verifyCommands: string[];
  commitMessage?: string;
  includeLint: boolean;
  includeHarness: boolean;
}

export interface HarnessVerifyStep {
  kind: 'lint' | 'harness' | 'test' | 'verify' | 'status' | 'commit';
  label: string;
  command: string;
}

const quoteShellArg = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const requireValue = (argv: string[], index: number, flag: string): string => {
  const value = argv[index + 1];

  if (!value) {
    throw new Error(`${flag} 값이 필요함`);
  }

  return value;
};

export const parseHarnessVerifyArgs = (
  argv: string[],
): HarnessVerifyOptions => {
  const lintTargets: string[] = [];
  const testCommands: string[] = [];
  const verifyCommands: string[] = [];
  let commitMessage: string | undefined;
  let includeLint = true;
  let includeHarness = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--lint-target') {
      const value = requireValue(argv, index, '--lint-target');
      lintTargets.push(value);
      index += 1;
      continue;
    }

    if (arg === '--test') {
      const value = requireValue(argv, index, '--test');
      testCommands.push(value);
      index += 1;
      continue;
    }

    if (arg === '--verify') {
      const value = requireValue(argv, index, '--verify');
      verifyCommands.push(value);
      index += 1;
      continue;
    }

    if (arg === '--commit') {
      commitMessage = requireValue(argv, index, '--commit');
      index += 1;
      continue;
    }

    if (arg === '--no-lint') {
      includeLint = false;
      continue;
    }

    if (arg === '--no-harness') {
      includeHarness = false;
      continue;
    }

    if (arg === '--help') {
      throw new Error(
        [
          'Usage: npm run verify:task -- --lint-target "<path>" --test "<command>" [--verify "<command>"] [--commit "<message>"]',
          '기본 실행: strict lint + npm run test:harness + --test ...',
        ].join('\n'),
      );
    }

    throw new Error(`알 수 없는 인자: ${arg}`);
  }

  if (testCommands.length === 0) {
    throw new Error('최소 1개의 --test "<command>" 가 필요함');
  }

  if (includeLint && lintTargets.length === 0) {
    throw new Error('최소 1개의 --lint-target "<path>" 가 필요함');
  }

  return {
    lintTargets,
    testCommands,
    verifyCommands,
    commitMessage,
    includeLint,
    includeHarness,
  };
};

export const buildStrictLintCommand = (targets: string[]): string => [
  'npm run lint:strict --',
  ...targets.map((target) => quoteShellArg(target)),
].join(' ');

export const buildHarnessVerifySteps = (
  options: HarnessVerifyOptions,
): HarnessVerifyStep[] => {
  const steps: HarnessVerifyStep[] = [];
  const {
    lintTargets,
    testCommands,
    verifyCommands,
    commitMessage,
    includeLint,
    includeHarness,
  } = options;

  if (includeLint) {
    steps.push({
      kind: 'lint',
      label: 'lint:strict',
      command: buildStrictLintCommand(lintTargets),
    });
  }

  if (includeHarness) {
    steps.push({
      kind: 'harness',
      label: 'harness',
      command: 'npm run test:harness',
    });
  }

  testCommands.forEach((command, index) => {
    steps.push({
      kind: 'test',
      label: `test:${index + 1}`,
      command,
    });
  });

  verifyCommands.forEach((command, index) => {
    steps.push({
      kind: 'verify',
      label: `verify:${index + 1}`,
      command,
    });
  });

  if (commitMessage) {
    steps.push({
      kind: 'status',
      label: 'git-status',
      command: 'git status --short',
    });
    steps.push({
      kind: 'commit',
      label: 'commit',
      command: `git commit -m ${quoteShellArg(commitMessage)}`,
    });
  }

  return steps;
};

const runStep = (step: HarnessVerifyStep): void => {
  console.log(`\n=== ${step.label} ===`);
  console.log(step.command);

  const result = spawnSync(step.command, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${step.label} 실패 (exit ${result.status ?? 'unknown'})`);
  }
};

const main = (): void => {
  const options = parseHarnessVerifyArgs(process.argv.slice(2));
  const steps = buildHarnessVerifySteps(options);

  console.log('=== verify:task 시작 ===');

  steps.forEach((step) => {
    runStep(step);
  });

  console.log('\n=== verify:task 완료 ===');
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[HARNESS_VERIFY] ${message}`);
    process.exit(1);
  }
}
