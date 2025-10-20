import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
    @ApiProperty({ description: 'Tên tag', example: 'Tết' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Slug của tag', example: 'tet' })
    @IsString()
    @IsNotEmpty()
    slug: string;

    @ApiProperty({ description: 'Mô tả tag', required: false })
    @IsString()
    @IsOptional()
    description?: string;
}
