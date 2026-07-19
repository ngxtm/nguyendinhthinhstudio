import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImageUploadProviderEventQuarantineLocationRebuilderService {
  constructor(private readonly prisma: PrismaService) {}

  async rebuild(limit = 100) {
    const quarantines = await this.prisma.imageUploadProviderEventQuarantine.findMany({ where: { state: { in: ['open', 'resolving', 'resolved'] } }, take: limit });
    let rebuilt = 0;
    for (const quarantine of quarantines) {
      const latest = await this.prisma.imageUploadProviderEventQuarantineLocation.findFirst({ where: { quarantineId: quarantine.id }, orderBy: { observedAt: 'desc' } });
      if (latest && latest.locationObservationSha256 !== quarantine.latestLocationObservationSha256) {
        await this.prisma.imageUploadProviderEventQuarantine.updateMany({ where: { id: quarantine.id }, data: { latestLocationObservationSha256: latest.locationObservationSha256 } });
        rebuilt++;
      }
    }
    return { scanned: quarantines.length, rebuilt };
  }
}
