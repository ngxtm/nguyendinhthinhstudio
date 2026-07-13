import { PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import {
  downloadStaticCloudflareAssets,
  importStaticAssetManifest,
  manifestPathFor,
  readStaticAssetManifest,
  type CloudflareStaticAssetMigrationDatabase,
} from '../src/images/migrations/cloudflare-static-assets';

type ScriptHooks = {
  env: NodeJS.ProcessEnv;
  repositoryRoot: string;
  createPrisma: () => PrismaClient;
  writeSummary: (summary: Record<string, unknown>) => void;
};

const defaultHooks: ScriptHooks = {
  env: process.env,
  repositoryRoot: resolve(__dirname, '../../..'),
  createPrisma: () => new PrismaClient(),
  writeSummary: (summary) => console.log(JSON.stringify(summary)),
};

function requiredEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseMode(argv: readonly string[]): 'download' | 'import-manifest' {
  if (argv.length === 0) {
    return 'download';
  }
  if (argv.length === 1 && argv[0] === '--import-manifest') {
    return 'import-manifest';
  }
  throw new Error(
    'Usage: download-static-cloudflare-images.ts [--import-manifest]',
  );
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  overrides: Partial<ScriptHooks> = {},
): Promise<Record<string, unknown>> {
  const hooks = { ...defaultHooks, ...overrides };
  const mode = parseMode(argv);

  if (mode === 'download') {
    const rows = await downloadStaticCloudflareAssets({
      repositoryRoot: hooks.repositoryRoot,
      accountId: requiredEnvironmentValue(hooks.env, 'CLOUDFLARE_ACCOUNT_ID'),
      readToken: requiredEnvironmentValue(
        hooks.env,
        'CLOUDFLARE_IMAGES_READ_TOKEN',
      ),
    });
    const summary = {
      mode,
      downloaded: rows.length,
      manifestPath: manifestPathFor(hooks.repositoryRoot),
    };
    hooks.writeSummary(summary);
    return summary;
  }

  const rows = await readStaticAssetManifest(hooks.repositoryRoot);
  const prisma = hooks.createPrisma();
  try {
    const result = await importStaticAssetManifest(
      rows,
      prisma as unknown as CloudflareStaticAssetMigrationDatabase,
    );
    const summary = {
      mode,
      ...result,
      manifestPath: manifestPathFor(hooks.repositoryRoot),
    };
    hooks.writeSummary(summary);
    return summary;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Static Cloudflare image migration failed',
    );
    process.exitCode = 1;
  });
}
