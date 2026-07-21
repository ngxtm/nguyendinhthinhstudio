import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../../..');

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
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

describe('backend Docker runner', () => {
  const dockerfile = readRepositoryFile('apps/backend/Dockerfile');

  it.each([
    '/app/dist/src/main.js',
    '/app/dist/scripts/reconcile-image-uploads.js',
    '/app/dist/scripts/resolve-image-upload-promotion-conflict.js',
    '/app/apps/backend/package.json',
  ])('contains %s', (artifact) => {
    expect(dockerfile).toContain(`test -f ${artifact}`);
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
  const backend =
    compose.match(
      /\r?\n  backend:\r?\n([\s\S]*?)(?=\r?\n  [\w-]+:\r?\n|\r?\nnetworks:)/,
    )?.[1] ?? '';
  const reconciler =
    compose.match(
      /\r?\n  images-upload-reconciler:\r?\n([\s\S]*?)(?=\r?\n  [\w-]+:\r?\n|\r?\nnetworks:)/,
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
});
