import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class ReorderImagesDto {
  @ApiProperty({
    example: ['image-id-1', 'image-id-2', 'image-id-3'],
    description: 'Array of image IDs in desired order',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  imageIds!: string[];
}
