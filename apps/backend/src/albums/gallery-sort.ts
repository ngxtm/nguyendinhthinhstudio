export type GallerySortableAlbum = {
  id: string;
  isFeatured: boolean;
  featuredOrder: number | null;
  shootDate: Date | string | null;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  categories?: Array<{
    category?: { slug?: string | null } | null;
  }>;
};

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function getGalleryActivityTimestamp(
  album: GallerySortableAlbum,
): number {
  return Math.max(
    toTimestamp(album.shootDate),
    toTimestamp(album.publishedAt),
    toTimestamp(album.createdAt),
  );
}

function isBeautyAlbum(album: GallerySortableAlbum): boolean {
  return Boolean(
    album.categories?.some(
      (assignment) => assignment.category?.slug === 'beauty',
    ),
  );
}

function compareNullableNumbersDesc(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right - left;
}

export function compareGalleryAlbums(
  left: GallerySortableAlbum,
  right: GallerySortableAlbum,
): number {
  if (left.isFeatured !== right.isFeatured) {
    return left.isFeatured ? -1 : 1;
  }

  if (left.isFeatured && right.isFeatured) {
    const featuredOrderComparison = compareNullableNumbersDesc(
      left.featuredOrder,
      right.featuredOrder,
    );
    if (featuredOrderComparison !== 0) return featuredOrderComparison;
  }

  const activityComparison =
    getGalleryActivityTimestamp(right) - getGalleryActivityTimestamp(left);
  if (activityComparison !== 0) return activityComparison;

  const beautyComparison =
    Number(isBeautyAlbum(right)) - Number(isBeautyAlbum(left));
  if (beautyComparison !== 0) return beautyComparison;

  return right.id.localeCompare(left.id);
}
