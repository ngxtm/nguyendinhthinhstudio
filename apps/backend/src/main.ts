import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { parseImageUploadRuntimeConfig } from './images/image-upload-runtime-config';

async function bootstrap() {
  const imageUploadRuntime = parseImageUploadRuntimeConfig(process.env, 'api');
  console.log(
    'Image upload runtime configuration validated',
    JSON.stringify(imageUploadRuntime.fingerprint),
  );

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', imageUploadRuntime.trustedProxyAllowlist);

  // Upload metadata stays bounded; image bytes go directly to R2.
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger configuration (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('NDT Studio Gallery API')
      .setDescription(
        'Backend API for NDT Studio Gallery - Albums, Images, and Authentication',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter your Supabase JWT token',
          in: 'header',
        },
        'bearer',
      )
      .addTag('albums', 'Album management endpoints')
      .addTag('images', 'Image upload and management endpoints')
      .addTag('tags', 'Tag management endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  // Enable CORS with environment-based origins for production
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3001',
  ];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger UI: http://localhost:${port}/api`);
}

bootstrap().catch((error) => {
  console.error('❌ Error starting application:', error);
  process.exit(1);
});
