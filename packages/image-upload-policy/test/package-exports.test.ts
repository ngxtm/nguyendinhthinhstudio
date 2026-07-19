import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const resolutionCases = [
  [
    'import',
    `console.log(import.meta.resolve('@ndt/image-upload-policy')); await import('@ndt/image-upload-policy')`,
  ],
  [
    'require',
    `console.log(require.resolve('@ndt/image-upload-policy')); require('@ndt/image-upload-policy')`,
  ],
] as const;

test('public package exports resolve to compiled artifacts', () => {
  for (const [kind, expression] of resolutionCases) {
    const args =
      kind === 'import'
        ? ['--input-type=module', '--eval', expression]
        : ['--eval', expression];
    const result = spawnSync(process.execPath, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    assert.equal(
      result.status,
      0,
      `${kind} failed:\n${result.stderr || result.stdout}`,
    );
    assert.doesNotMatch(result.stdout, /[\\/]src[\\/]/);
  }
});

test('consumer manifests declare the policy and types workspace edges', () => {
  const expectedEdges = [
    [
      'apps/backend/package.json',
      {
        dependencies: { '@ndt/image-upload-policy': '^0.1.0' },
        devDependencies: { '@ndt/types': '^0.1.0' },
      },
    ],
    [
      'apps/frontend/package.json',
      {
        dependencies: { '@ndt/image-upload-policy': '^0.1.0' },
        devDependencies: { '@ndt/types': '^0.1.0' },
      },
    ],
    [
      'packages/types/package.json',
      {
        dependencies: { '@ndt/image-upload-policy': '^0.1.0' },
      },
    ],
  ] as const;

  for (const [manifestPath, expected] of expectedEdges) {
    const manifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, manifestPath), 'utf8'),
    );

    for (const [section, edges] of Object.entries(expected)) {
      for (const [name, version] of Object.entries(edges)) {
        assert.equal(
          manifest[section]?.[name],
          version,
          `${manifestPath} must declare ${name} in ${section}`,
        );
      }
    }
  }
});

test('application-rooted resolution uses repository packages', () => {
  for (const application of ['backend', 'frontend']) {
    const requireFromApplication = createRequire(
      resolve(repositoryRoot, 'apps', application, 'package.json'),
    );

    for (const packageName of ['@ndt/image-upload-policy', '@ndt/types']) {
      const resolvedPath = requireFromApplication.resolve(packageName);
      const expectedPackageDirectory = resolve(
        repositoryRoot,
        'packages',
        packageName.slice('@ndt/'.length),
      );
      const pathWithinRepository = relative(
        expectedPackageDirectory,
        resolvedPath,
      );

      assert.ok(
        pathWithinRepository &&
          !pathWithinRepository.startsWith('..') &&
          !isAbsolute(pathWithinRepository),
        `${packageName} from ${application} resolved outside ${expectedPackageDirectory}: ${resolvedPath}`,
      );
    }
  }
});

test('application builds depend on the policy build', () => {
  const turboCommand =
    process.platform === 'win32'
      ? {
          command: process.env.ComSpec ?? 'cmd.exe',
          args: ['/d', '/s', '/c', 'npx turbo run build --dry=json'],
        }
      : {
          command: 'npx',
          args: ['turbo', 'run', 'build', '--dry=json'],
        };
  const result = spawnSync(turboCommand.command, turboCommand.args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `turbo dry run failed:\n${result.stderr || result.stdout}`,
  );

  const dryRun = JSON.parse(result.stdout);
  for (const application of ['backend', 'frontend']) {
    const task = dryRun.tasks.find(
      (candidate: { taskId: string }) =>
        candidate.taskId === `${application}#build`,
    );
    assert.ok(task, `missing ${application}#build from turbo dry run`);
    assert.ok(
      task.dependencies.includes('@ndt/image-upload-policy#build'),
      `${application}#build does not depend on @ndt/image-upload-policy#build`,
    );
  }
});
