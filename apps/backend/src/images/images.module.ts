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
import { ImageUploadRateLimitService } from './image-upload-rate-limit.service';
import { ImageInspectionSemaphoreService } from './image-inspection-semaphore.service';
import { StoredImageInspectorService } from './stored-image-inspector.service';
import { PendingUploadExpiryService } from './pending-upload-expiry.service';
import { ImageUploadRateLimitCleanupService } from './image-upload-rate-limit-cleanup.service';
import { ImageUploadReconcilerService } from './image-upload-reconciler.service';
import { ImageUploadPromotionRecoveryService } from './image-upload-promotion-recovery.service';
import { IMAGE_UPLOAD_CONTROLLER_RUNTIME } from './images.controller';
import { parseImageUploadIngress } from './image-upload-ingress';
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
    ImageUploadRateLimitService,
    ImageInspectionSemaphoreService,
    StoredImageInspectorService,
    PendingUploadExpiryService,
    ImageUploadRateLimitCleanupService,
    ImageUploadReconcilerService,
    ImageUploadPromotionRecoveryService,
    {
      provide: IMAGE_UPLOAD_CONTROLLER_RUNTIME,
      useFactory: () => parseImageUploadIngress(process.env, 'api'),
    },
  ],
  exports: [
    ImagesService,
    StorageService,
    ImageUrlService,
    ImagePresenterService,
    UploadCleanupService,
    ImageUploadPromotionRepository,
    ImageUploadRateLimitService,
    ImageInspectionSemaphoreService,
    StoredImageInspectorService,
    PendingUploadExpiryService,
    ImageUploadRateLimitCleanupService,
    ImageUploadReconcilerService,
    ImageUploadPromotionRecoveryService,
  ],
})
export class ImagesModule {}
