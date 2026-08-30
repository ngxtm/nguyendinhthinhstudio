import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryAlbumImagesDto {
  @ApiProperty({
    example: 4,
    description: 'Number of public album images to return',
    required: false,
    default: 4,
    minimum: 1,
    maximum: 50,
  })
  @IsNumber()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  @IsOptional()
  limit: number = 4;

  @ApiProperty({
    example: 'eyJvcmRlckluZGV4Ijo4LCJpZCI6ImltYWdlLTgifQ',
    description: 'Cursor returned by the previous image batch',
    required: false,
  })
  @IsString()
  @IsOptional()
  cursor?: string;
}
