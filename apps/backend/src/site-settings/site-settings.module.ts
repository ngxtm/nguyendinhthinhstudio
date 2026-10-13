import { Module } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
import { SiteSettingsController } from './site-settings.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ImagesModule } from '../images/images.module';
import { HomepageCollectionController } from './homepage-collection.controller';
import { HomepageCollectionService } from './homepage-collection.service';

@Module({
  imports: [PrismaModule, AuthModule, ImagesModule],
  controllers: [SiteSettingsController, HomepageCollectionController],
  providers: [SiteSettingsService, HomepageCollectionService],
  exports: [SiteSettingsService],
})
export class SiteSettingsModule {}
