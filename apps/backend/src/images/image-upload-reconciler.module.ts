import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { parseImageUploadRuntimeConfig } from './image-upload-runtime-config';
import { StorageService } from './storage.service';
import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';
import { PendingUploadExpiryService } from './pending-upload-expiry.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { ImageDeletionService } from './image-deletion.service';
import { ImageUploadRateLimitService } from './image-upload-rate-limit.service';
import { ImageUploadRateLimitCleanupService } from './image-upload-rate-limit-cleanup.service';
import { ImageUploadReconcilerService } from './image-upload-reconciler.service';
import { ImageUploadPromotionRecoveryService } from './image-upload-promotion-recovery.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment) => {
        parseImageUploadRuntimeConfig(environment, 'reconciler');
        return environment;
      },
    }),
    PrismaModule,
  ],
  providers: [
    StorageService,
    ImageUploadPromotionRepository,
    PendingUploadExpiryService,
    UploadCleanupService,
    ImageDeletionService,
    ImageUploadRateLimitService,
    ImageUploadRateLimitCleanupService,
    ImageUploadPromotionRecoveryService,
    ImageUploadReconcilerService,
  ],
  exports: [ImageUploadReconcilerService],
})
export class ImageUploadReconcilerModule {}
