import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlbumsService } from './albums.service';
import { AlbumsController } from './albums.controller';
import { RecommendationService } from './recommendation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StorageService } from '../images/storage.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [AlbumsController],
  providers: [AlbumsService, RecommendationService, StorageService],
  exports: [AlbumsService, RecommendationService],
})
export class AlbumsModule {}

