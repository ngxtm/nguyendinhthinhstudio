import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkDeleteImagesDto } from './dto/bulk-delete-images.dto';
import { MoveImagesDto } from './dto/move-images.dto';

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `image-${index + 1}`);
}

describe('large album image selections', () => {
  it('accepts a 500-image bulk deletion snapshot', async () => {
    const dto = plainToInstance(BulkDeleteImagesDto, { imageIds: ids(500) });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('accepts a 500-image move snapshot', async () => {
    const dto = plainToInstance(MoveImagesDto, {
      imageIds: ids(500),
      targetAlbumId: 'target-album',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });
});
