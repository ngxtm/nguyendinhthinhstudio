import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, Max, Matches } from 'class-validator';

export class UploadRequestDto {
  @ApiProperty({ example: 'uuid-album-id', description: 'Album ID to upload image to' })
  @IsString()
  @IsNotEmpty()
  albumId!: string;

  @ApiProperty({ example: 'beautiful-sunset.jpg', description: 'Original filename' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({ example: 52428800, description: 'File size in bytes (max 100MB)' })
  @IsNumber()
  @Max(104857600, { message: 'File size must not exceed 100MB' })
  fileSize!: number;

  @ApiProperty({ example: 'image/jpeg', description: 'Content type of the image' })
  @IsString()
  @Matches(/^image\/(jpeg|jpg|png|webp|gif)$/, { message: 'Invalid image content type' })
  contentType!: string;
}

