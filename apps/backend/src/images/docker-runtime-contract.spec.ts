import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../../..');

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function containsSourceRootModuleSpecifier(source: string): boolean {
  return /['"]src\//.test(source);
}

function expectBefore(source: string, earlier: string, later: string): void {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  expect(earlierIndex).toBeGreaterThanOrEqual(0);
  expect(laterIndex).toBeGreaterThan(earlierIndex);
}

describe.each([
  [
    'backend',
    'apps/backend/Dockerfile',
    [
      'COPY apps/backend/package.json ./apps/backend/',
      'COPY packages/image-upload-policy/package.json ./packages/image-upload-policy/',
      'COPY packages/types/package.json ./packages/types/',
    ],
    'RUN npm run build --workspace=backend',
  ],
  [
    'frontend',
    'apps/frontend/Dockerfile',
    [
      'COPY apps/frontend/package.json ./apps/frontend/',
      'COPY packages/image-upload-policy/package.json ./packages/image-upload-policy/',
      'COPY packages/types/package.json ./packages/types/',
    ],
    'RUN npm run build --workspace=frontend',
  ],
] as const)(
  '%s Docker builder',
  (_name, dockerfilePath, consumedManifests, applicationBuild) => {
    const dockerfile = readRepositoryFile(dockerfilePath);

    it('copies root lockfiles and consumed workspace manifests before npm ci', () => {
      expectBefore(
        dockerfile,
        'COPY package.json package-lock.json ./',
        'RUN npm ci',
      );
      for (const manifest of consumedManifests) {
        expectBefore(dockerfile, manifest, 'RUN npm ci');
      }
    });

    it('builds image-upload-policy before compiling the application', () => {
      expectBefore(
        dockerfile,
        'RUN npm run build --workspace=@ndt/image-upload-policy',
        applicationBuild,
      );
    });

    it('packages the compiled policy at its workspace path in the runner', () => {
      expect(dockerfile).toContain('COPY --from=builder --chown=');
      expect(dockerfile).toContain(
        '/app/packages/image-upload-policy/package.json ./packages/image-upload-policy/package.json',
      );
      expect(dockerfile).toContain(
        '/app/packages/image-upload-policy/dist ./packages/image-upload-policy/dist',
      );

      for (const artifact of [
        '/app/packages/image-upload-policy/package.json',
        '/app/packages/image-upload-policy/dist/esm/index.js',
        '/app/packages/image-upload-policy/dist/cjs/index.js',
        '/app/packages/image-upload-policy/dist/index.d.ts',
        '/app/packages/image-upload-policy/dist/cjs/package.json',
      ]) {
        expect(dockerfile).toContain(`test -f ${artifact}`);
      }

      expect(dockerfile).not.toContain(
        'packages/image-upload-policy/dist/index.js',
      );
    });
  },
);

describe('frontend Docker dependency boundary', () => {
  const dockerfile = readRepositoryFile('apps/frontend/Dockerfile');

  it('copies frontend workspace dependencies and disables Next lockfile mutation in the builder', () => {
    expect(dockerfile).toContain(
      'COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules',
    );
    expect(dockerfile).toContain('ENV NEXT_IGNORE_INCORRECT_LOCKFILE=1');
  });
});

describe('backend Docker runner', () => {
  const dockerfile = readRepositoryFile('apps/backend/Dockerfile');

  it('pins the Node base image by immutable digest', () => {
    expect(dockerfile).toContain(
      'FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base',
    );
    expect(dockerfile).not.toContain('FROM node:24-alpine AS base');
  });

  it('validates and labels the exact release commit in the final image', () => {
    expect(dockerfile).toContain('ARG IMAGE_UPLOAD_RELEASE_COMMIT');
    expect(dockerfile).toContain(
      'RUN test "${#IMAGE_UPLOAD_RELEASE_COMMIT}" -eq 40',
    );
    expect(dockerfile).toContain(
      'case "$IMAGE_UPLOAD_RELEASE_COMMIT" in *[!a-f0-9]*) exit 1 ;; *) exit 0 ;; esac',
    );
    expect(dockerfile).not.toContain("grep -Eq '^[a-f0-9]{40}$'");
    expect(dockerfile).toContain(
      'LABEL studio.nguyendinhthinh.image-upload.release-commit=$IMAGE_UPLOAD_RELEASE_COMMIT',
    );
  });
  const backendPackage = JSON.parse(
    readRepositoryFile('apps/backend/package.json'),
  ) as { devDependencies?: Record<string, string> };

  it.each([
    '/app/dist/src/main.js',
    '/app/dist/scripts/reconcile-image-uploads.js',
    '/app/dist/scripts/resolve-image-upload-promotion-conflict.js',
    '/app/apps/backend/package.json',
  ])('contains %s', (artifact) => {
    expect(dockerfile).toContain(`test -f ${artifact}`);
  });

  it('uses the lockfile-pinned tsc-alias binary without an install fallback', () => {
    expect(backendPackage.devDependencies?.['tsc-alias']).toBeDefined();
    expect(dockerfile).toContain(
      'RUN npx --no-install tsc-alias -p tsconfig.build.json',
    );
    expect(dockerfile).not.toContain('RUN npx tsc-alias');
  });

  it('fails the image build when a compiled src alias remains unresolved', () => {
    expect(dockerfile).toContain(`! grep -R -n '"src/' runtime-dist`);
    expect(dockerfile).toContain(`! grep -R -n "'src/" runtime-dist`);
  });
});

describe('operator smoke one-shot Docker runner', () => {
  const dockerfile = readRepositoryFile(
    'apps/backend/Dockerfile.operator-smoke',
  );
  const backendDockerfile = readRepositoryFile('apps/backend/Dockerfile');

  it('uses pinned Debian Playwright Chromium without adding a browser to Alpine backend', () => {
    expect(
      dockerfile.match(
        /FROM mcr\.microsoft\.com\/playwright:v1\.60\.0-noble@sha256:/g,
      ),
    ).toHaveLength(2);
    expect(dockerfile).not.toContain('node:24-alpine');
    expect(dockerfile).toContain('PLAYWRIGHT_BROWSERS_PATH=/ms-playwright');
    expect(dockerfile).toContain('chromium.executablePath()');
    expect(dockerfile).not.toMatch(/chrome-stable|google-chrome/i);
    expect(backendDockerfile).not.toMatch(/playwright|chromium|chrome/i);
  });

  it('labels the release and packages the production smoke CLI', () => {
    expect(dockerfile).toContain('ARG IMAGE_UPLOAD_RELEASE_COMMIT');
    expect(dockerfile).toContain('ARG IMAGE_UPLOAD_BUILD_FINGERPRINT');
    expect(dockerfile).toContain(
      'LABEL studio.nguyendinhthinh.image-upload.release-commit=$IMAGE_UPLOAD_RELEASE_COMMIT',
    );
    expect(dockerfile).toContain(
      'LABEL studio.nguyendinhthinh.image-upload.release-fingerprint=$IMAGE_UPLOAD_BUILD_FINGERPRINT',
    );
    expect(dockerfile).toContain(
      '/app/dist/scripts/run-image-upload-production-smoke.js',
    );
  });
});

describe('backend production module resolution', () => {
  it.each([
    `import value from 'src/example'`,
    `export { value } from "src/example"`,
    `require('src/example')`,
    `import("src/example")`,
  ])('detects the source-root module specifier in %s', (source) => {
    expect(containsSourceRootModuleSpecifier(source)).toBe(true);
  });

  it('does not use source-root aliases that plain Node cannot resolve', () => {
    const sourceRoot = resolve(repositoryRoot, 'apps/backend/src');
    const unresolvedImports = collectTypeScriptFiles(sourceRoot)
      .filter((path) => !path.endsWith('.spec.ts'))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return containsSourceRootModuleSpecifier(source)
          ? [path.replace(repositoryRoot, '')]
          : [];
      });

    expect(unresolvedImports).toEqual([]);
  });
});

describe('reconciler runtime graph', () => {
  const entrypoint = readRepositoryFile(
    'apps/backend/src/scripts/reconcile-image-uploads.ts',
  );

  it('boots a role-specific application context instead of the HTTP API graph', () => {
    expect(entrypoint).toContain(
      "import('../images/image-upload-reconciler.module.js')",
    );
    expect(entrypoint).not.toContain("import('../app.module.js')");
    expect(entrypoint).toContain('runtime.reconcileCadenceMs');
    expect(entrypoint).not.toContain('setTimeout(resolve, 60_000)');
  });
});

describe('Compose image-upload process roles', () => {
  const compose = readRepositoryFile('docker-compose.yml');
  const workflow = readRepositoryFile('.github/workflows/image-upload.yml');
  const backend =
    compose.match(
      /\r?\n {2}backend:\r?\n([\s\S]*?)(?=\r?\n {2}[\w-]+:\r?\n|\r?\nnetworks:)/,
    )?.[1] ?? '';
  const reconciler =
    compose.match(
      /\r?\n {2}images-upload-reconciler:\r?\n([\s\S]*?)(?=\r?\n {2}[\w-]+:\r?\n|\r?\nnetworks:)/,
    )?.[1] ?? '';
  const migration =
    compose.match(
      /\r?\n {2}backend-migrate:\r?\n([\s\S]*?)(?=\r?\n {2}[\w-]+:\r?\n|\r?\nnetworks:)/,
    )?.[1] ?? '';

  it('keeps reconciler R2, cutover, and operator secrets out of the API', () => {
    expect(backend).toContain('IMAGE_UPLOAD_PROCESS_ROLE=api');
    for (const secret of [
      'IMAGE_UPLOAD_QUEUE_TOKEN',
      'IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID',
      'IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY',
      'IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN',
      'IMAGE_UPLOAD_OPERATOR_TOKEN',
    ]) {
      expect(backend).not.toContain(secret);
    }
  });

  it('binds ingress mode everywhere but exposes the smoke token only to API', () => {
    expect(backend).toContain('IMAGE_UPLOAD_INGRESS_MODE=');
    expect(reconciler).toContain('IMAGE_UPLOAD_INGRESS_MODE=disabled');
    expect(migration).toContain('IMAGE_UPLOAD_INGRESS_MODE=disabled');
    expect(backend).toContain('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN=');
    expect(reconciler).not.toContain('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN');
    expect(migration).not.toContain('IMAGE_UPLOAD_OPERATOR_SMOKE_TOKEN');
  });

  it('runs exactly one reconciler with only its role-specific credentials', () => {
    expect(reconciler).toContain('command:');
    expect(reconciler).toContain(
      '/app/dist/scripts/reconcile-image-uploads.js',
    );
    expect(reconciler).toContain('IMAGE_UPLOAD_PROCESS_ROLE=reconciler');
    expect(reconciler).toContain('IMAGE_UPLOAD_RECONCILE_GRACE_MS=');
    expect(reconciler).toContain('IMAGE_UPLOAD_RECONCILE_CADENCE_MS=');
    expect(reconciler).toContain('IMAGE_UPLOAD_RECONCILER_R2_ACCESS_KEY_ID=');
    expect(reconciler).toContain(
      'IMAGE_UPLOAD_RECONCILER_R2_SECRET_ACCESS_KEY=',
    );
    expect(reconciler).toContain('restart: unless-stopped');
    expect(reconciler).toMatch(/replicas:\s*1/);
    expect(reconciler).not.toContain('IMAGE_UPLOAD_API_R2_');
    expect(reconciler).not.toContain('IMAGE_UPLOAD_CUTOVER_');
    expect(reconciler).not.toContain('IMAGE_UPLOAD_OPERATOR_TOKEN');
    expect(reconciler).not.toContain('IMGPROXY_KEY');
    expect(reconciler).not.toContain('IMGPROXY_SALT');
    expect(reconciler).not.toContain('SUPABASE_');
    expect(reconciler).not.toContain('NDT_STAGING_');
    for (const obsolete of [
      'IMAGE_UPLOAD_QUEUE_ID',
      'IMAGE_UPLOAD_DLQ_ID',
      'IMAGE_UPLOAD_SOURCE_CONSUMER_ID',
      'IMAGE_UPLOAD_DLQ_CONSUMER_ID',
      'IMAGE_UPLOAD_QUEUE_TOKEN',
      'IMAGE_UPLOAD_CLOUDFLARE_ACCOUNT_ID',
    ]) {
      expect(reconciler).not.toContain(obsolete);
    }
  });

  it('uses the same immutable backend image for API and reconciler', () => {
    expect(compose).toContain('${BACKEND_IMAGE:?BACKEND_IMAGE is required}');
    expect(backend).toContain('image: *backend-image');
    expect(reconciler).toContain('image: *backend-image');
    expect(reconciler).not.toContain('build:');
  });

  it('keeps the image reference separate from the reconciler build fingerprint', () => {
    expect(reconciler).toContain(
      'IMAGE_UPLOAD_BUILD_FINGERPRINT=${IMAGE_UPLOAD_BUILD_FINGERPRINT:?IMAGE_UPLOAD_BUILD_FINGERPRINT is required}',
    );
    expect(reconciler).not.toContain(
      'IMAGE_UPLOAD_BUILD_FINGERPRINT=${BACKEND_IMAGE',
    );
  });

  it('provides a canonical build fingerprint to the Compose packaging check', () => {
    expect(workflow).toContain(`release_commit="$(git rev-parse HEAD)"`);
    expect(workflow).toContain(
      `fingerprint="$(node scripts/image-upload-release-fingerprint.mjs "$release_commit")"`,
    );
    expect(workflow).toContain(
      `echo "IMAGE_UPLOAD_BUILD_FINGERPRINT=$fingerprint" >> "$GITHUB_ENV"`,
    );
    expect(workflow).toContain(
      `echo "IMAGE_UPLOAD_RELEASE_COMMIT=$release_commit" >> "$GITHUB_ENV"`,
    );
    expectBefore(
      workflow,
      'name: Bind Compose heartbeat fingerprint to checked-out release',
      'docker build --build-arg "IMAGE_UPLOAD_RELEASE_COMMIT=$IMAGE_UPLOAD_RELEASE_COMMIT"',
    );
    expect(workflow).toContain(
      'docker build --build-arg "IMAGE_UPLOAD_RELEASE_COMMIT=$IMAGE_UPLOAD_RELEASE_COMMIT" -f apps/backend/Dockerfile -t ndt-backend:image-upload-ci .',
    );
    expect(compose).toContain(
      'IMAGE_UPLOAD_RELEASE_COMMIT: ${IMAGE_UPLOAD_RELEASE_COMMIT:?IMAGE_UPLOAD_RELEASE_COMMIT is required}',
    );
    expect(workflow).not.toContain(
      `fingerprint="$(docker image inspect --format '{{.Id}}' "$BACKEND_IMAGE")"`,
    );
  });
});
