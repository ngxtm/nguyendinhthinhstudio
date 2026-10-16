import { BadRequestException, ConflictException } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsService } from '../site-settings/site-settings.service';

describe('pricing drafts and publication', () => {
  let rows: Map<string, { key: string; value: string }>;
  let service: PricingService;
  let prisma: {
    siteSettings: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    rows = new Map();
    prisma = {
      siteSettings: {
        findUnique: jest.fn(({ where }: { where: { key: string } }) =>
          Promise.resolve(rows.get(where.key) ?? null),
        ),
        create: jest.fn(
          ({ data }: { data: { key: string; value: string } }) => {
            if (rows.has(data.key))
              return Promise.reject(
                Object.assign(new Error('Unique conflict'), { code: 'P2002' }),
              );
            rows.set(data.key, { ...data });
            return Promise.resolve(data);
          },
        ),
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { key: string; value: string };
            data: { value: string };
          }) => {
            if (rows.get(where.key)?.value !== where.value)
              return Promise.resolve({ count: 0 });
            rows.set(where.key, { key: where.key, ...data });
            return Promise.resolve({ count: 1 });
          },
        ),
      },
    };
    service = new PricingService(prisma as unknown as PrismaService);
  });

  it('preserves existing prices without requiring a seed or a write on read', async () => {
    const result = await service.getPublished('ca-nhan');
    expect(result.prices['premium-i']).toBe(3_500_000);
    expect(result.publishedAt).toBeNull();
    expect(rows.size).toBe(0);
  });

  it('keeps drafts private across reloads and publishes exactly the submitted prices atomically', async () => {
    const initial = await service.getConfiguration('ca-nhan');
    const prices = { ...initial.draft, 'premium-i': 3_900_000 };
    const saved = await service.save(
      'ca-nhan',
      { revision: initial.revision, prices },
      false,
    );
    expect((await service.getConfiguration('ca-nhan')).draft['premium-i']).toBe(
      3_900_000,
    );
    expect((await service.getPublished('ca-nhan')).prices['premium-i']).toBe(
      3_500_000,
    );
    expect(await service.getPublished('ca-nhan')).not.toHaveProperty('draft');
    expect(await service.getPublished('ca-nhan')).not.toHaveProperty(
      'revision',
    );
    const published = await service.save(
      'ca-nhan',
      { revision: saved.revision, prices },
      true,
    );
    expect(published.draft).toEqual(published.published);
    expect(published.publishedAt).not.toBeNull();
    expect((await service.getPublished('ca-nhan')).prices['premium-i']).toBe(
      3_900_000,
    );
    expect((await service.getPublished('couple')).prices['premium-i']).toBe(
      4_200_000,
    );
    const next = await service.save(
      'ca-nhan',
      {
        revision: published.revision,
        prices: { ...prices, 'premium-i': 4_000_000 },
      },
      false,
    );
    expect(next.publishedAt).toBe(published.publishedAt);
    expect((await service.getPublished('ca-nhan')).prices['premium-i']).toBe(
      3_900_000,
    );
  });

  it('allows publishing edits without an intermediate draft save', async () => {
    const state = await service.getConfiguration('gia-dinh');
    await service.save(
      'gia-dinh',
      {
        revision: state.revision,
        prices: { ...state.draft, 'family-i': 1_234_567 },
      },
      true,
    );
    expect((await service.getPublished('gia-dinh')).prices['family-i']).toBe(
      1_234_567,
    );
  });

  it.each([0, -1, 3.5, 1_000_000_000, NaN, Infinity, '3900000', null])(
    'rejects invalid monetary values %p',
    async (value) => {
      const state = await service.getConfiguration('ca-nhan');
      await expect(
        service.save(
          'ca-nhan',
          {
            revision: state.revision,
            prices: { ...state.draft, 'premium-i': value } as never,
          },
          false,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rows.size).toBe(0);
    },
  );

  it('rejects incomplete, unknown and extra package IDs', async () => {
    const state = await service.getConfiguration('ca-nhan');
    const missing = { ...state.draft };
    delete missing['premium-i'];
    for (const prices of [
      missing,
      { ...state.draft, invented: 1 },
      { ...missing, invented: 1 },
    ]) {
      await expect(
        service.save('ca-nhan', { revision: state.revision, prices }, true),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('refuses stale revisions and simultaneous first writes', async () => {
    const state = await service.getConfiguration('video');
    const input = { revision: state.revision, prices: state.draft };
    const results = await Promise.allSettled([
      service.save('video', input, false),
      service.save('video', input, true),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    await expect(service.save('video', input, true)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('uses compare-and-swap to prevent a concurrent publication from overwriting another edit', async () => {
    const initial = await service.getConfiguration('team');
    const state = await service.save(
      'team',
      { revision: initial.revision, prices: initial.draft },
      false,
    );
    prisma.siteSettings.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.save(
        'team',
        { revision: state.revision, prices: state.draft },
        true,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not replace malformed persisted data with old default prices', async () => {
    rows.set('pricing.ca-nhan', { key: 'pricing.ca-nhan', value: '{broken' });
    await expect(service.getPublished('ca-nhan')).rejects.toMatchObject({
      status: 500,
    });
    await expect(service.getConfiguration('unknown')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('blocks the generic settings endpoint from bypassing the publication workflow', async () => {
    const settings = new SiteSettingsService(
      prisma as unknown as PrismaService,
    );
    await expect(settings.upsert('pricing.ca-nhan', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rows.size).toBe(0);
  });
});
