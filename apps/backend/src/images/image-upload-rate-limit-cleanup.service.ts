import { Injectable } from '@nestjs/common';
import { ImageUploadRateLimitService } from './image-upload-rate-limit.service';

@Injectable()
export class ImageUploadRateLimitCleanupService {
  constructor(private readonly rateLimit: ImageUploadRateLimitService) {}

  async runOnce(): Promise<{ deleted: number }> {
    return { deleted: await this.rateLimit.cleanupExpired() };
  }
}
