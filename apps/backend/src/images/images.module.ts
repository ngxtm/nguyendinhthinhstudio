import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { ImagePresenterService } from './image-presenter.service';
import { ImageUrlService } from './image-url.service';
import { StorageService } from './storage.service';
import { ImageDeletionService } from './image-deletion.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';
import { ImageUploadPolicyService } from './image-upload-policy.service';
import { ImageUploadRateLimitService } from './image-upload-rate-limit.service';
import { ImageInspectionSemaphoreService } from './image-inspection-semaphore.service';
import { StoredImageInspectorService } from './stored-image-inspector.service';
import { CloudflareQueueClient } from './cloudflare-queue.client';
import { PendingUploadExpiryService } from './pending-upload-expiry.service';
import { R2CopySettlementService } from './r2-copy-settlement.service';
import { ImageUploadRateLimitCleanupService } from './image-upload-rate-limit-cleanup.service';
import { ImageUploadProviderEventQuarantineLocationRepository } from './image-upload-provider-event-quarantine-location.repository';
import { ImageUploadProviderEventQuarantineActionRepository } from './image-upload-provider-event-quarantine-action.repository';
import { ImageUploadProviderEventQuarantineResolutionRepository } from './image-upload-provider-event-quarantine-resolution.repository';
import { ImageUploadProviderEventQuarantineLocationRebuilderService } from './image-upload-provider-event-quarantine-location-rebuilder.service';
import { ImageUploadReconcilerService } from './image-upload-reconciler.service';
import { IMAGE_UPLOAD_CONTROLLER_RUNTIME } from './images.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    StorageService,
    ImageUrlService,
    ImagePresenterService,
    ImageDeletionService,
    UploadCleanupService,
    ImageUploadPromotionRepository,
    ImageUploadPolicyService,
    ImageUploadRateLimitService,
    ImageInspectionSemaphoreService,
    StoredImageInspectorService,
    CloudflareQueueClient,
    PendingUploadExpiryService,
    R2CopySettlementService,
    ImageUploadRateLimitCleanupService,
    ImageUploadProviderEventQuarantineLocationRepository,
    ImageUploadProviderEventQuarantineActionRepository,
    ImageUploadProviderEventQuarantineResolutionRepository,
    ImageUploadProviderEventQuarantineLocationRebuilderService,
    ImageUploadReconcilerService,
    {
      provide: IMAGE_UPLOAD_CONTROLLER_RUNTIME,
      useFactory: () => ({
        presignEnabled: process.env.IMAGE_UPLOAD_PRESIGN_ENABLED !== 'false',
      }),
    },
  ],
  exports: [
    ImagesService,
    StorageService,
    ImageUrlService,
    ImagePresenterService,
    UploadCleanupService,
    ImageUploadPromotionRepository,
    ImageUploadPolicyService,
    ImageUploadRateLimitService,
    ImageInspectionSemaphoreService,
    StoredImageInspectorService,
    CloudflareQueueClient,
    PendingUploadExpiryService,
    R2CopySettlementService,
    ImageUploadRateLimitCleanupService,
    ImageUploadProviderEventQuarantineLocationRepository,
    ImageUploadProviderEventQuarantineActionRepository,
    ImageUploadProviderEventQuarantineResolutionRepository,
    ImageUploadProviderEventQuarantineLocationRebuilderService,
    ImageUploadReconcilerService,
  ],
})
export class ImagesModule {}
