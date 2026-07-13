import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/images/storage.service';
import { UploadCleanupService } from '../src/images/upload-cleanup.service';
async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const result = await new UploadCleanupService(
    prisma,
    new StorageService(new ConfigService()),
  ).cleanupExpired();
  console.log(JSON.stringify(result));
  await prisma.$disconnect();
}
main().catch(() => process.exit(1));
