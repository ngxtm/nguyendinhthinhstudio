import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePresenterService } from '../images/image-presenter.service';
import { runSerializableWithRetry } from '../prisma/serializable-retry';
import { QueryHomepageCollectionDto } from './dto/homepage-collection.dto';

export const HOMEPAGE_COLLECTION_KEY = 'homepage.latestCollection';
const PAGE_SIZE = 20;
const VIETNAMESE_LETTERS =
  'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';

export function normalizeCollectionSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

const albumSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  coverImage: true,
  categories: {
    where: { source: 'manual' },
    select: { category: { select: { name: true } } },
    orderBy: { depth: 'asc' as const },
  },
} satisfies Prisma.AlbumSelect;

type CollectionAlbum = Prisma.AlbumGetPayload<{ select: typeof albumSelect }>;

const eligibleWhere: Prisma.AlbumWhereInput = {
  status: 'published',
  deleteStatus: 'active',
  coverImage: {
    is: {
      uploadStatus: 'completed',
      OR: [
        { r2ObjectKey: { not: null } },
        { thumbnailUrl: { not: '' } },
        { smallUrl: { not: '' } },
        { mediumUrl: { not: '' } },
        { largeUrl: { not: '' } },
        { xlargeUrl: { not: '' } },
      ],
    },
  },
};

function readAlbumIds(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const ids: unknown[] = parsed;
    if (
      ids.length === 3 &&
      ids.every(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ) &&
      new Set(ids).size === 3
    ) {
      return ids;
    }
  } catch {
    // An invalid legacy value behaves like an unconfigured collection.
  }
  return null;
}

@Injectable()
export class HomepageCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly imagePresenter: ImagePresenterService,
  ) {}

  private present(album: CollectionAlbum) {
    if (!album.coverImage || album.coverImage.albumId !== album.id) return null;
    const coverImage = this.imagePresenter.presentImage(album.coverImage);
    if (
      ![
        coverImage.thumbnailUrl,
        coverImage.smallUrl,
        coverImage.mediumUrl,
        coverImage.largeUrl,
        coverImage.xlargeUrl,
      ].some(Boolean)
    )
      return null;
    return {
      id: album.id,
      title: album.title,
      slug: album.slug,
      description: album.description,
      coverImage,
      categories: album.categories.map(({ category }) => category),
    };
  }

  async getConfiguration() {
    const setting = await this.prisma.siteSettings.findUnique({
      where: { key: HOMEPAGE_COLLECTION_KEY },
    });
    const albumIds = readAlbumIds(setting?.value);
    const rows = await this.prisma.album.findMany({
      where: {
        ...eligibleWhere,
        ...(albumIds ? { id: { in: albumIds } } : {}),
      },
      select: albumSelect,
      ...(albumIds
        ? {}
        : {
            orderBy: [
              {
                publishedAt: { sort: 'desc' as const, nulls: 'last' as const },
              },
              { createdAt: 'desc' as const },
              { id: 'desc' as const },
            ],
            take: 3,
          }),
    });
    const byId = new Map(rows.map((album) => [album.id, album]));
    const orderedRows = albumIds
      ? albumIds.flatMap((id) => {
          const album = byId.get(id);
          return album ? [album] : [];
        })
      : rows;
    const albums = orderedRows
      .map((album) => this.present(album))
      .filter((album): album is NonNullable<typeof album> => album !== null);
    return {
      configured: albumIds !== null,
      albumIds: albumIds ?? albums.map((album) => album.id),
      albums,
    };
  }

  async getPublicCollection() {
    const { albums } = await this.getConfiguration();
    return { albums };
  }

  async save(albumIds: string[]) {
    if (
      !Array.isArray(albumIds) ||
      albumIds.length !== 3 ||
      albumIds.some((id) => typeof id !== 'string' || !id) ||
      new Set(albumIds).size !== 3
    ) {
      throw new BadRequestException('Hãy chọn đúng 3 bộ ảnh khác nhau.');
    }

    return runSerializableWithRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.album.findMany({
            where: { ...eligibleWhere, id: { in: albumIds } },
            select: albumSelect,
          });
          const byId = new Map(rows.map((album) => [album.id, album]));
          const albums = albumIds.map((id) => {
            const row = byId.get(id);
            return row ? this.present(row) : null;
          });
          if (albums.some((album) => album === null)) {
            throw new BadRequestException(
              'Bộ ảnh đã thay đổi. Hãy chọn 3 bộ ảnh đã xuất bản và có ảnh bìa hợp lệ.',
            );
          }
          const value = JSON.stringify(albumIds);
          await tx.siteSettings.upsert({
            where: { key: HOMEPAGE_COLLECTION_KEY },
            create: { key: HOMEPAGE_COLLECTION_KEY, value },
            update: { value },
          });
          return { configured: true, albumIds, albums };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async search(query: QueryHomepageCollectionDto) {
    const page = query.page ?? 1;
    const tokens = normalizeCollectionSearch(query.search ?? '')
      .split(' ')
      .filter(Boolean);
    const matches = tokens.length
      ? Prisma.sql`AND ${Prisma.join(
          tokens.map(
            (token) => Prisma.sql`
          strpos(translate(lower(a.title), ${VIETNAMESE_LETTERS}, ${normalizeCollectionSearch(VIETNAMESE_LETTERS)}), ${token}) > 0
        `,
          ),
          ' AND ',
        )}`
      : Prisma.empty;
    // Parameterized SQL supports Vietnamese name search without a DB extension.
    const ids = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a.id FROM "Album" a
      JOIN "Image" i ON i.id = a."coverImageId" AND i."albumId" = a.id
      WHERE a.status = 'published' AND a."deleteStatus" = 'active'
        AND i."uploadStatus" = 'completed'
        AND (i."r2ObjectKey" IS NOT NULL OR i."thumbnailUrl" <> ''
          OR i."smallUrl" <> '' OR i."mediumUrl" <> '' OR i."largeUrl" <> '' OR i."xlargeUrl" <> '')
        ${matches}
      ORDER BY a."publishedAt" DESC NULLS LAST, a."createdAt" DESC, a.id DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}
    `);
    const pageIds = ids.slice(0, PAGE_SIZE).map(({ id }) => id);
    const rows = pageIds.length
      ? await this.prisma.album.findMany({
          where: { ...eligibleWhere, id: { in: pageIds } },
          select: albumSelect,
        })
      : [];
    const byId = new Map(rows.map((album) => [album.id, album]));
    const albums = pageIds.flatMap((id) => {
      const row = byId.get(id);
      const album = row ? this.present(row) : null;
      return album ? [album] : [];
    });
    return { albums, pagination: { page, hasMore: ids.length > PAGE_SIZE } };
  }
}
