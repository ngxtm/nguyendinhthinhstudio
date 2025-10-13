import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class UploadConfirmDto {
  @ApiProperty({ example: 'uuid-upload-id', description: 'Upload ID from presigned URL request' })
  @IsString()
  @IsNotEmpty()
  uploadId!: string;

  @ApiProperty({ example: 'cloudflare-image-id', description: 'Cloudflare image ID' })
  @IsString()
  @IsNotEmpty()
  cloudflareImageId!: string;

  @ApiProperty({
    example: {
      public: 'https://imagedelivery.net/.../public',
      thumbnail: 'https://imagedelivery.net/.../thumbnail'
    },
    description: 'Cloudflare image variants (optional, will be generated if not provided)',
    required: false,
  })
  @IsObject()
  @IsOptional()
  variants?: Record<string, string>;
}

