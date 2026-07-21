import { Module } from '@nestjs/common';
// Keep cutover/reconciler entrypoints in the Nest source graph so the normal
// production build emits dist/scripts/*.js artifacts.
import * as ReconcileEntrypoint from './scripts/reconcile-image-uploads';
import * as ConflictEntrypoint from './scripts/resolve-image-upload-promotion-conflict';

export const IMAGE_UPLOAD_ENTRYPOINTS = [ReconcileEntrypoint, ConflictEntrypoint];
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TagsModule } from './tags/tags.module';
import { CategoriesModule } from './categories/categories.module';
import { AuthModule } from './auth/auth.module';
import { AlbumsModule } from './albums/albums.module';
import { ImagesModule } from './images/images.module';
import { validateEnv } from './config/env.validation';
import { AuditInterceptor } from './audit/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 120, // public API + health monitors sit behind Cloudflare/Traefik
    }]),
    PrismaModule,
    AuthModule,
    TagsModule,
    CategoriesModule,
    AlbumsModule,
    ImagesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
