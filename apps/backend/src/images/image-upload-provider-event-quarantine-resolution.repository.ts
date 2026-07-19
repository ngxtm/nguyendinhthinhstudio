import { Injectable } from '@nestjs/common';
import { ImageUploadPromotionRepository } from './image-upload-promotion.repository';

@Injectable()
export class ImageUploadProviderEventQuarantineResolutionRepository {
  constructor(private readonly promotions: ImageUploadPromotionRepository) {}
  begin(input: any) { return this.promotions.beginProviderEventQuarantineResolution(input); }
  finalize(input: any) { return this.promotions.finalizeProviderEventQuarantineResolution(input); }
  reopen(input: any) { return this.promotions.reopenProviderEventQuarantineAfterReplay(input); }
}
