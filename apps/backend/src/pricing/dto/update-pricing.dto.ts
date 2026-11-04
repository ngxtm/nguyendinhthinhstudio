import {
  ArrayUnique,
  IsArray,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { PricingPrices } from '@ndt/types';

export class UpdatePricingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  revision: string;

  @IsObject()
  prices: PricingPrices;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  hiddenPackageIds?: string[];
}
