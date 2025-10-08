import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
    @ApiProperty({ example: 'Technology' })
    name!: string;

    @ApiProperty({ example: 'technology' })
    slug!: string;

    @ApiProperty({ example: 'Tag for technology related content', required: false })
    description?: string;
}
