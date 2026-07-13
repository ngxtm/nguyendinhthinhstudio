import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { ImageUrlService } from './image-url.service';
import { StorageService } from './storage.service';
import { ImageDeletionService } from './image-deletion.service';
import { UploadCleanupService } from './upload-cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    StorageService,
    ImageUrlService,
    ImageDeletionService,
    UploadCleanupService,
  ],
  exports: [ImagesService, StorageService, ImageUrlService],
})
export class ImagesModule {}
