import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAlbumsDto {
  @ApiProperty({
    example: 'published',
    description: 'Filter by status',
    enum: ['draft', 'published', 'scheduled', 'all'],
    required: false,
    default: 'published',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({
    example: 'wedding',
    description: 'Filter by category',
    required: false,
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    example: 'nha-trang',
    description: 'Filter by tag slug',
    required: false,
  })
  @IsString()
  @IsOptional()
  tag?: string;

  @ApiProperty({
    example: 'wedding',
    description: 'Search keyword across title, slug, categories, and tags',
    required: false,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({
    example: true,
    description: 'Filter featured albums only',
    required: false,
  })
  @IsOptional()
  isFeatured?: boolean;

  @ApiProperty({
    example: 20,
    description: 'Number of albums to return',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;

  @ApiProperty({
    example: 1,
    description: 'Page number for admin pagination',
    required: false,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @ApiProperty({
    example: 'album-id-xxx',
    description: 'Cursor for pagination (last album ID from previous page)',
    required: false,
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiProperty({
    example: 'newest',
    description: 'Sort order',
    enum: ['newest', 'oldest', 'popular', 'featured', 'gallery'],
    required: false,
    default: 'newest',
  })
  @IsEnum(['newest', 'oldest', 'popular', 'featured', 'gallery'])
  @IsOptional()
  sortBy?: 'newest' | 'oldest' | 'popular' | 'featured' | 'gallery' = 'newest';
}
