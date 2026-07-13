import { PrismaClient } from '@prisma/client';
import {
  parseMigrationOptions,
  runCloudflareR2Migration,
  type MigrationImageReader,
} from '../src/images/migrations/cloudflare-r2-migration';

export async function main(argv: readonly string[] = process.argv.slice(2)) {
  const options = parseMigrationOptions(argv);
  const prisma = new PrismaClient();
  const images: MigrationImageReader = {
    findMany: (args) => prisma.image.findMany(args),
  };

  try {
    const summary = await runCloudflareR2Migration(options, { images });
    console.log(JSON.stringify(summary));
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
