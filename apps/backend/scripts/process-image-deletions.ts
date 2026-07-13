import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/images/storage.service';
import { ImageDeletionService } from '../src/images/image-deletion.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const result = await new ImageDeletionService(
    prisma,
    new StorageService(new ConfigService()),
  ).processPending();
  console.log(JSON.stringify(result));
  await prisma.$disconnect();
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Deletion job failed');
  process.exit(1);
});
