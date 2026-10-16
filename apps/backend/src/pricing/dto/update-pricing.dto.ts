import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import type { PricingPrices } from '@ndt/types';

export class UpdatePricingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  revision: string;

  @IsObject()
  prices: PricingPrices;
}
