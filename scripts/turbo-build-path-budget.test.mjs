/* global process */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WINDOWS_CMD_PATH_LIMIT = 8191;
const TURBO_PARENT_PATH_BUDGET = 6800;

function createWindowsPathBudgetEnvironment() {
  const nodeDirectory = dirname(process.execPath);
  const rootBin = join(REPOSITORY_ROOT, 'node_modules', '.bin');
  const entries = [rootBin, nodeDirectory];

  for (let index = 0; entries.join(';').length < TURBO_PARENT_PATH_BUDGET; index += 1) {
    entries.push(`C:\\turbo-path-budget-padding\\${String(index).padStart(4, '0')}`);
  }

  const path = entries.join(';').slice(0, TURBO_PARENT_PATH_BUDGET);
  assert.ok(path.length < WINDOWS_CMD_PATH_LIMIT);

  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'path'),
    ),
    PATH: path,
  };
}

function assertTurboBuild(packageFilter, { only = false } = {}) {
  const turbo = join(
    REPOSITORY_ROOT,
    'node_modules',
    '@turbo',
    'windows-64',
    'bin',
    'turbo.exe',
  );
  const args = [
    'run',
    'build',
    `--filter=${packageFilter}`,
    '--force',
    '--output-logs=full',
  ];
  if (only) {
    args.push('--only');
  }

  const result = spawnSync(turbo, args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: createWindowsPathBudgetEnvironment(),
    timeout: 55_000,
  });
  const output = [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join('\n');

  assert.equal(result.status, 0, output);
}

test(
  'Turbo policy build stays within the cmd.exe PATH budget',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  () => assertTurboBuild('@ndt/image-upload-policy'),
);

test(
  'Turbo backend build stays within the cmd.exe PATH budget',
  { skip: process.platform !== 'win32', timeout: 60_000 },
  () => assertTurboBuild('backend', { only: true }),
);
