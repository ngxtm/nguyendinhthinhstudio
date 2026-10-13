import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  HomepageCollectionService,
  HOMEPAGE_COLLECTION_KEY,
} from '../src/site-settings/homepage-collection.service';
import { ImagePresenterService } from '../src/images/image-presenter.service';
import { PrismaService } from '../src/prisma/prisma.service';

const execFileAsync = promisify(execFile);

describe('homepage collection with PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let service: HomepageCollectionService;
  const ids: string[] = Array.from({ length: 25 }, () => randomUUID());
  const imageIds = Array.from({ length: 25 }, () => randomUUID());
  const names = [
    'Nàng Sen',
    'Nắng tháng tư',
    'Đường Nắng',
    ...Array.from({ length: 22 }, (_, i) => `Bộ ảnh ${i + 4}`),
  ];
  jest.setTimeout(120000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const databaseUrl = container.getConnectionUri();
    await execFileAsync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        resolve(__dirname, '../prisma/schema.prisma'),
      ],
      {
        cwd: resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          DIRECT_URL: databaseUrl,
        },
      },
    );
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    service = new HomepageCollectionService(
      prisma as PrismaService,
      {
        presentImage(image) {
          return {
            id: image.id,
            filename: image.filename,
            orderIndex: image.orderIndex,
            smallUrl: image.smallUrl,
          };
        },
      } as ImagePresenterService,
    );
    await prisma.album.createMany({
      data: ids.map((id, i) => ({
        id,
        title: names[i],
        slug: `fixture-${i}`,
        status: 'published',
        deleteStatus: 'active',
        publishedAt: new Date(Date.UTC(2026, 0, 1, i)),
        isFeatured: i === 0,
      })),
    });
    await prisma.image.createMany({
      data: imageIds.map((id, i) => ({
        id,
        albumId: ids[i],
        filename: 'cover.webp',
        uploadStatus: 'completed',
        smallUrl: `https://example.test/${id}.webp`,
      })),
    });
    for (let i = 0; i < ids.length; i++) {
      await prisma.album.update({
        where: { id: ids[i] },
        data: { coverImageId: imageIds[i] },
      });
    }
  });

  afterEach(async () => {
    if (!prisma) return;
    await prisma.siteSettings.deleteMany();
    await prisma.album.updateMany({
      data: { status: 'published', deleteStatus: 'active' },
    });
    await prisma.image.updateMany({ data: { uploadStatus: 'completed' } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('searches Vietnamese names without accents and matches every word', async () => {
    const result = await service.search({ search: 'NANG' });
    expect(result.albums.map((album) => album.title)).toEqual([
      'Đường Nắng',
      'Nắng tháng tư',
      'Nàng Sen',
    ]);
    expect(
      (await service.search({ search: 'DUONG' })).albums.map(
        (album) => album.id,
      ),
    ).toEqual([ids[2]]);
    expect(
      (await service.search({ search: 'thang  nang' })).albums.map(
        (album) => album.id,
      ),
    ).toEqual([ids[1]]);
    expect((await service.search({ search: "%' OR 1=1--" })).albums).toEqual(
      [],
    );
  });

  it('paginates eligible albums, excluding drafts, deleting albums and incomplete covers', async () => {
    await prisma.album.update({
      where: { id: ids[0] },
      data: { status: 'draft' },
    });
    await prisma.album.update({
      where: { id: ids[1] },
      data: { deleteStatus: 'deleting' },
    });
    await prisma.image.update({
      where: { id: imageIds[2] },
      data: { uploadStatus: 'pending' },
    });
    const first = await service.search({ page: 1 });
    const second = await service.search({ page: 2 });
    expect(first.albums).toHaveLength(20);
    expect(first.pagination.hasMore).toBe(true);
    expect(second.albums).toHaveLength(2);
    expect(second.pagination.hasMore).toBe(false);
    expect(
      [...first.albums, ...second.albums].some((album) =>
        ids.slice(0, 3).includes(album.id),
      ),
    ).toBe(false);
  });

  it('persists the exact order, reads it publicly, and preserves featured flags', async () => {
    const selection = [ids[2], ids[0], ids[1]];
    await service.save(selection);
    expect(
      (await service.getPublicCollection()).albums.map((album) => album.id),
    ).toEqual(selection);
    const stored = await prisma.siteSettings.findUniqueOrThrow({
      where: { key: HOMEPAGE_COLLECTION_KEY },
    });
    expect(JSON.parse(stored.value)).toEqual(selection);
    expect(
      (await prisma.album.findUniqueOrThrow({ where: { id: ids[0] } }))
        .isFeatured,
    ).toBe(true);
    expect(
      (await prisma.album.findUniqueOrThrow({ where: { id: ids[1] } }))
        .isFeatured,
    ).toBe(false);
  });

  it('rejects stale choices without overwriting the previously saved collection', async () => {
    const selection = [ids[2], ids[0], ids[1]];
    await service.save(selection);
    await prisma.album.update({
      where: { id: ids[0] },
      data: { status: 'draft' },
    });
    await expect(service.save([ids[0], ids[3], ids[4]])).rejects.toThrow(
      'Bộ ảnh đã thay đổi',
    );
    const stored = await prisma.siteSettings.findUniqueOrThrow({
      where: { key: HOMEPAGE_COLLECTION_KEY },
    });
    expect(JSON.parse(stored.value)).toEqual(selection);
    expect(
      (await service.getPublicCollection()).albums.map((album) => album.id),
    ).toEqual([ids[2], ids[1]]);
    expect((await service.getConfiguration()).albumIds).toEqual(selection);
  });
});
