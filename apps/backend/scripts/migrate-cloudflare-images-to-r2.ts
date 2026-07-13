import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { validateEnv } from '../src/config/env.validation';
import { ImageUrlService } from '../src/images/image-url.service';
import {
  migrateOneImage,
  parseMigrationOptions,
  runCloudflareR2Migration,
  type ImageStorageMigrationDatabase,
  type MigrationImageReader,
  type MigrationRunDependencies,
  type MigrationSummary,
} from '../src/images/migrations/cloudflare-r2-migration';

type ExecuteMigrateOne = NonNullable<MigrationRunDependencies['migrateOne']>;

export type MigrationScriptHooks = {
  env: NodeJS.ProcessEnv;
  createPrisma: () => PrismaClient;
  createExecuteMigrateOne: (
    prisma: PrismaClient,
    env: NodeJS.ProcessEnv,
  ) => ExecuteMigrateOne;
  writeSummary: (summary: MigrationSummary) => void;
};

function getRequiredEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function validateMigrationExecuteEnvironment(
  env: NodeJS.ProcessEnv,
): void {
  getRequiredEnvironmentValue(env, 'CLOUDFLARE_ACCOUNT_ID');
  getRequiredEnvironmentValue(env, 'CLOUDFLARE_IMAGES_READ_TOKEN');
  validateEnv(env);
}

function createExecuteMigrateOne(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv,
): ExecuteMigrateOne {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: getRequiredEnvironmentValue(env, 'R2_S3_ENDPOINT'),
    credentials: {
      accessKeyId: getRequiredEnvironmentValue(env, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnvironmentValue(env, 'R2_SECRET_ACCESS_KEY'),
    },
  });
  const imageUrls = new ImageUrlService(new ConfigService(env));
  const dependencies = {
    database: prisma as unknown as ImageStorageMigrationDatabase,
    r2,
    bucket: getRequiredEnvironmentValue(env, 'CLOUDFLARE_R2_BUCKET_NAME'),
    accountId: getRequiredEnvironmentValue(env, 'CLOUDFLARE_ACCOUNT_ID'),
    readToken: getRequiredEnvironmentValue(env, 'CLOUDFLARE_IMAGES_READ_TOKEN'),
    imageUrls,
  };

  return (image) => migrateOneImage(image, dependencies);
}

const defaultHooks: MigrationScriptHooks = {
  env: process.env,
  createPrisma: () => new PrismaClient(),
  createExecuteMigrateOne,
  writeSummary: (summary) => console.log(JSON.stringify(summary)),
};

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  overrides: Partial<MigrationScriptHooks> = {},
): Promise<MigrationSummary> {
  const hooks: MigrationScriptHooks = { ...defaultHooks, ...overrides };
  const options = parseMigrationOptions(argv);
  if (options.mode === 'execute') {
    validateMigrationExecuteEnvironment(hooks.env);
  }

  const prisma = hooks.createPrisma();
  const images: MigrationImageReader = {
    findMany: (args) => prisma.image.findMany(args),
  };

  try {
    const migrateOne =
      options.mode === 'execute'
        ? hooks.createExecuteMigrateOne(prisma, hooks.env)
        : undefined;
    const summary = await runCloudflareR2Migration(options, {
      images,
      ...(migrateOne ? { migrateOne } : {}),
    });
    hooks.writeSummary(summary);
    return summary;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Image migration failed',
    );
    process.exitCode = 1;
  });
}
