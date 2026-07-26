import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Value is intentionally permissive (any JSON-serialisable type),
 * validated loosely on the server side via JSON encoding.
 */
export class UpdateSiteSettingDto {
  @ApiProperty({
    description: 'Giá trị cấu hình (JSON-serialisable: string/number/boolean/object/array)',
    example: { name: 'NDT Studio' },
  })
  @IsNotEmpty()
  value: unknown;
}

export class CreateSiteSettingDto extends UpdateSiteSettingDto {
  @ApiProperty({ description: 'Khóa cấu hình', example: 'studio.branding' })
  @IsString()
  @IsNotEmpty()
  key: string;
}