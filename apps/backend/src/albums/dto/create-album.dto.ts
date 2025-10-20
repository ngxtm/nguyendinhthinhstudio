import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, IsDateString } from 'class-validator';

export class CreateAlbumDto {
  @ApiProperty({ example: 'Nàng Sen - Beauty Collection', description: 'Album title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ 
    example: 'nang-sen-beauty-collection', 
    description: 'URL-friendly slug (auto-generated if not provided)',
    required: false 
  })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiProperty({
    example: 'Beautiful collection of lotus-themed beauty photos',
    description: 'Album description',
    required: false
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: '2024-06-15',
    description: 'Date when the photos were taken (YYYY-MM-DD)',
    required: false
  })
  @IsDateString()
  @IsOptional()
  shootDate?: string;

  @ApiProperty({
    example: 'uuid-of-category',
    description: 'Category ID (UUID)',
    required: false
  })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ 
    example: ['nang-tho', 'nha-trang', 'bien'], 
    description: 'Tag slugs to associate with album',
    required: false,
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tagSlugs?: string[];

  @ApiProperty({ 
    example: 'draft', 
    description: 'Publishing status',
    enum: ['draft', 'published', 'scheduled'],
    default: 'draft'
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ 
    example: '2024-12-31T00:00:00Z', 
    description: 'Scheduled publish date/time',
    required: false 
  })
  @IsDateString()
  @IsOptional()
  scheduledPublishAt?: string;

  @ApiProperty({ 
    example: false, 
    description: 'Featured on homepage',
    default: false 
  })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiProperty({ 
    example: 1, 
    description: 'Featured order (lower = higher priority)',
    required: false 
  })
  @IsOptional()
  featuredOrder?: number;

  @ApiProperty({ 
    example: 'https://drive.google.com/drive/folders/xxx', 
    description: 'Google Drive link for original photos',
    required: false 
  })
  @IsString()
  @IsOptional()
  googleDriveLink?: string;

  @ApiProperty({ 
    example: 'Nàng Sen - Beauty Photos | NDT Studio', 
    description: 'SEO meta title',
    required: false 
  })
  @IsString()
  @IsOptional()
  metaTitle?: string;

  @ApiProperty({ 
    example: 'Stunning beauty photography collection featuring lotus theme at Nha Trang beach', 
    description: 'SEO meta description',
    required: false 
  })
  @IsString()
  @IsOptional()
  metaDescription?: string;
}

