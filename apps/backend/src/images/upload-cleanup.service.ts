import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class UploadCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async cleanupExpired(albumId?: string) {
    const now = new Date();
    const scope = albumId ? { albumId } : {};
    const expired = await (this.prisma as any).imageUpload.findMany({
      where: {
        ...scope,
        status: { in: ['pending', 'failed', 'finalizing'] },
        expiresAt: { lt: now },
      },
      take: 100,
    });
    const consumed = await (this.prisma as any).imageUpload.findMany({
      where: {
        ...scope,
        status: 'consumed',
        consumedAt: { lt: new Date(now.getTime() - 7 * 86400000) },
      },
      take: 100,
    });
    let objectsDeleted = 0;
    let sessionsDeleted = 0;
    let failed = 0;
    for (const session of expired) {
      try {
        await this.storage.deleteObject(session.uploadObjectKey);
        objectsDeleted++;
        if (
          (await (this.prisma as any).image.count({
            where: { r2ObjectKey: session.finalObjectKey },
          })) === 0
        ) {
          await this.storage.deleteObject(session.finalObjectKey);
          objectsDeleted++;
        }
        const result = await (this.prisma as any).imageUpload.deleteMany({
          where: { id: session.id, status: session.status },
        });
        sessionsDeleted += result?.count ?? 1;
      } catch {
        failed++;
      }
    }
    for (const session of consumed) {
      try {
        await this.storage.deleteObject(session.uploadObjectKey);
        objectsDeleted++;
        const result = await (this.prisma as any).imageUpload.deleteMany({
          where: { id: session.id, status: 'consumed' },
        });
        sessionsDeleted += result?.count ?? 1;
      } catch {
        failed++;
      }
    }
    return {
      scanned: expired.length + consumed.length,
      objectsDeleted,
      sessionsDeleted,
      failed,
    };
  }
}
