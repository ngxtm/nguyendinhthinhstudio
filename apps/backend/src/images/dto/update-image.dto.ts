import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateImageDto {
  @ApiProperty({ example: 'Beautiful sunset over the ocean', description: 'Alt text for SEO', required: false })
  @IsString()
  @IsOptional()
  altText?: string;

  @ApiProperty({ example: 'sunset.jpg', description: 'Updated filename', required: false })
  @IsString()
  @IsOptional()
  filename?: string;
}

