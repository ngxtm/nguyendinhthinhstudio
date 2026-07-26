import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export class AvatarPresignDto {
  @ApiProperty({ description: 'MIME type ảnh avatar', example: 'image/webp' })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_AVATAR_TYPES)
  contentType: string;

  @ApiProperty({ description: 'Dung lượng file (bytes)', example: 524288 })
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  fileSize: number;
}