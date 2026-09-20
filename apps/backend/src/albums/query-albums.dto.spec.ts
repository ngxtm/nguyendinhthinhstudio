import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryAlbumsDto } from './dto/query-albums.dto';

describe('QueryAlbumsDto pagination compatibility', () => {
  it('keeps a decimal page valid for shared request validation', async () => {
    const dto = plainToInstance(QueryAlbumsDto, { page: '1.5' });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects repeated page query values at request validation', async () => {
    const dto = plainToInstance(QueryAlbumsDto, { page: ['2', '3'] });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
