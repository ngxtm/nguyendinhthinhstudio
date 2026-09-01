import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePresenterService } from '../images/image-presenter.service';

type RecommendationBucket = 'direct' | 'adjacent' | 'discovery';

interface ScoredAlbum {
  album: any;
  score: number;
  bucket: RecommendationBucket;
}

interface CachedRecommendations {
  data: any[];
  timestamp: number;
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);
  private readonly cache = new Map<string, CachedRecommendations>();
  private readonly CACHE_TTL = 10 * 60 * 1000;
  private readonly DISPLAY_LIMIT = 8;
  private readonly recommendationInclude = {
    tags: {
      include: {
        tag: true,
      },
    },
    categories: {
      include: {
        category: {
          include: {
            parent: true,
          },
        },
      },
      orderBy: {
        depth: 'asc' as const,
      },
    },
    coverImage: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly imagePresenter: ImagePresenterService,
  ) {}

  /**
   * Get related albums using category-aware buckets and weekly rotation.
   * The public page renders the first eight items; extra items preserve the
   * existing twelve-item API response for other consumers.
   */
  async getRelatedAlbums(albumSlug: string, limit: number = 12) {
    const rotationKey = this.getRotationKey();
    const cacheKey = `${albumSlug}:${rotationKey}:${limit}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const currentAlbum = await this.prisma.album.findUnique({
      where: { slug: albumSlug, status: 'published', deleteStatus: 'active' },
      include: this.recommendationInclude,
    });

    if (!currentAlbum) {
      return [];
    }

    const candidates = await this.prisma.album.findMany({
      where: {
        status: 'published',
        deleteStatus: 'active',
        id: { not: currentAlbum.id },
      },
      include: this.recommendationInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    });

    const scoredAlbums = candidates.map((candidate: any) =>
      this.scoreCandidate(currentAlbum, candidate),
    );
    const recommendations = this.buildRecommendations(
      scoredAlbums,
      limit,
      `${currentAlbum.id}:${rotationKey}`,
    );
    const result = recommendations.map(({ album }) =>
      this.presentRecommendation(album),
    );

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  }

  private buildRecommendations(
    scoredAlbums: ScoredAlbum[],
    limit: number,
    rotationSeed: string,
  ): ScoredAlbum[] {
    const requestedLimit = Math.max(0, limit);
    const visibleLimit = Math.min(this.DISPLAY_LIMIT, requestedLimit);

    if (visibleLimit === 0) {
      return [];
    }

    const directQuota = Math.min(4, visibleLimit);
    const adjacentQuota = Math.min(2, Math.max(0, visibleLimit - directQuota));
    const discoveryQuota = Math.max(
      0,
      visibleLimit - directQuota - adjacentQuota,
    );

    const direct = this.selectFromBucket(
      scoredAlbums.filter((item) => item.bucket === 'direct'),
      directQuota,
      `${rotationSeed}:direct`,
    );
    const adjacent = this.selectFromBucket(
      scoredAlbums.filter((item) => item.bucket === 'adjacent'),
      adjacentQuota,
      `${rotationSeed}:adjacent`,
    );
    const discovery = this.selectDiscovery(
      scoredAlbums.filter((item) => item.bucket === 'discovery'),
      discoveryQuota,
      rotationSeed,
    );

    const visible = this.interleaveBuckets(
      direct,
      adjacent,
      discovery,
      visibleLimit,
    );
    this.fillFromRemaining(visible, scoredAlbums, visibleLimit, rotationSeed);

    if (visible.length >= requestedLimit) {
      return visible.slice(0, requestedLimit);
    }

    const usedIds = new Set(visible.map((item) => item.album.id));
    const remaining = scoredAlbums.filter(
      (item) => !usedIds.has(item.album.id),
    );
    const extras = this.selectAdditional(
      remaining,
      requestedLimit - visible.length,
      `${rotationSeed}:extra`,
    );

    return [...visible, ...extras].slice(0, requestedLimit);
  }

  private selectFromBucket(
    candidates: ScoredAlbum[],
    count: number,
    rotationSeed: string,
  ): ScoredAlbum[] {
    if (count <= 0 || candidates.length === 0) {
      return [];
    }

    const ranked = [...candidates].sort((a, b) =>
      this.compareScoredAlbums(a, b),
    );
    const poolSize = Math.min(ranked.length, Math.max(count * 2, count + 3));
    const pool = ranked.slice(0, poolSize);

    return this.rotate(pool, count, this.hashSeed(rotationSeed));
  }

  private selectDiscovery(
    candidates: ScoredAlbum[],
    count: number,
    rotationSeed: string,
  ): ScoredAlbum[] {
    if (count <= 0 || candidates.length === 0) {
      return [];
    }

    const selected: ScoredAlbum[] = [];
    const featured = candidates.filter((item) => item.album.isFeatured);
    const featuredPick = this.selectFromBucket(
      featured,
      Math.min(1, count),
      `${rotationSeed}:featured`,
    );
    selected.push(...featuredPick);

    const usedIds = new Set(selected.map((item) => item.album.id));
    const nonFeatured = candidates.filter(
      (item) => !usedIds.has(item.album.id) && !item.album.isFeatured,
    );
    const fallbackPool = nonFeatured.length
      ? nonFeatured
      : candidates.filter((item) => !usedIds.has(item.album.id));
    const freshPopular = [...fallbackPool].sort((a, b) =>
      this.compareDiscoveryAlbums(a, b),
    );
    const remainingCount = count - selected.length;

    if (remainingCount > 0 && freshPopular.length > 0) {
      selected.push(freshPopular[0]);
      selected.push(
        ...this.rotate(
          freshPopular.slice(1),
          remainingCount - 1,
          this.hashSeed(`${rotationSeed}:fresh-popular`),
        ),
      );
    }

    return selected;
  }

  private interleaveBuckets(
    direct: ScoredAlbum[],
    adjacent: ScoredAlbum[],
    discovery: ScoredAlbum[],
    limit: number,
  ): ScoredAlbum[] {
    const pools: Record<RecommendationBucket, ScoredAlbum[]> = {
      direct: [...direct],
      adjacent: [...adjacent],
      discovery: [...discovery],
    };
    const pattern: RecommendationBucket[] = [
      'direct',
      'direct',
      'adjacent',
      'direct',
      'adjacent',
      'direct',
      'discovery',
      'discovery',
    ];
    const result: ScoredAlbum[] = [];

    for (const bucket of pattern) {
      const item = pools[bucket].shift();
      if (item) {
        result.push(item);
      }
    }

    for (const bucket of ['direct', 'adjacent', 'discovery'] as const) {
      while (result.length < limit && pools[bucket].length > 0) {
        result.push(pools[bucket].shift() as ScoredAlbum);
      }
    }

    return result;
  }

  private fillFromRemaining(
    selected: ScoredAlbum[],
    candidates: ScoredAlbum[],
    limit: number,
    rotationSeed: string,
  ) {
    if (selected.length >= limit) {
      return;
    }

    const usedIds = new Set(selected.map((item) => item.album.id));
    const remaining = candidates.filter((item) => !usedIds.has(item.album.id));
    const buckets: RecommendationBucket[] = ['direct', 'adjacent', 'discovery'];

    for (const bucket of buckets) {
      const available = remaining.filter((item) => item.bucket === bucket);
      const needed = limit - selected.length;
      if (needed <= 0) {
        break;
      }

      const picks = this.selectFromBucket(
        available,
        needed,
        `${rotationSeed}:fill:${bucket}`,
      );
      selected.push(...picks);
      picks.forEach((item) => usedIds.add(item.album.id));
    }
  }

  private selectAdditional(
    candidates: ScoredAlbum[],
    count: number,
    rotationSeed: string,
  ): ScoredAlbum[] {
    if (count <= 0 || candidates.length === 0) {
      return [];
    }

    const bucketOrder: Record<RecommendationBucket, number> = {
      direct: 0,
      adjacent: 1,
      discovery: 2,
    };
    const ranked = [...candidates].sort(
      (a, b) =>
        bucketOrder[a.bucket] - bucketOrder[b.bucket] ||
        this.compareScoredAlbums(a, b),
    );

    return this.rotate(ranked, count, this.hashSeed(rotationSeed));
  }

  private scoreCandidate(currentAlbum: any, candidate: any): ScoredAlbum {
    const currentCategorySlugs = this.getCategorySlugs(currentAlbum);
    const candidateCategorySlugs = this.getCategorySlugs(candidate);
    const currentTagsByType = this.groupTagsByType(this.getTags(currentAlbum));
    const candidateTagsByType = this.groupTagsByType(this.getTags(candidate));

    const categoryMatches = this.countMatches(
      currentCategorySlugs,
      candidateCategorySlugs,
    );
    const subCategoryMatches = this.countMatches(
      currentTagsByType.sub_category || [],
      candidateTagsByType.sub_category || [],
    );
    const mainCategoryMatches = this.countMatches(
      currentTagsByType.main_category || [],
      candidateTagsByType.main_category || [],
    );
    const styleMatches = this.countMatches(
      currentTagsByType.style || [],
      candidateTagsByType.style || [],
    );
    const locationMatches = this.countMatches(
      currentTagsByType.location || [],
      candidateTagsByType.location || [],
    );

    const score =
      categoryMatches * 100 +
      subCategoryMatches * 30 +
      mainCategoryMatches * 20 +
      styleMatches * 10 +
      locationMatches * 6;
    const hasDirectSignal =
      categoryMatches > 0 || subCategoryMatches > 0 || mainCategoryMatches > 0;
    const hasAdjacentSignal = styleMatches > 0 || locationMatches > 0;
    const bucket: RecommendationBucket = hasDirectSignal
      ? 'direct'
      : hasAdjacentSignal
        ? 'adjacent'
        : 'discovery';

    return { album: candidate, score, bucket };
  }

  private presentRecommendation(album: any) {
    const categories = this.presentCategories(album.categories);
    const primaryCategory =
      categories.find((category: any) => category.source === 'manual') ??
      categories[0] ??
      null;

    return {
      id: album.id,
      title: album.title,
      slug: album.slug,
      category: primaryCategory,
      primaryCategory,
      categories,
      coverImage: album.coverImage
        ? this.imagePresenter.presentImage(album.coverImage)
        : album.coverImage,
      viewCount: album.viewCount,
      imageCount: album.imageCount,
      tags: this.getTags(album).map((tag: any) => ({
        name: tag.name,
        slug: tag.slug,
        type: tag.type,
      })),
    };
  }

  private presentCategories(categoryRelations: any[] | undefined) {
    if (!Array.isArray(categoryRelations)) {
      return [];
    }

    return categoryRelations
      .map((relation) => {
        const category = relation?.category ?? relation;
        if (!category?.id || !category?.name || !category?.slug) {
          return null;
        }

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          depth: typeof relation?.depth === 'number' ? relation.depth : 0,
          source: relation?.source === 'parent' ? 'parent' : 'manual',
        };
      })
      .filter(Boolean)
      .sort(
        (a: any, b: any) => a.depth - b.depth || a.name.localeCompare(b.name),
      );
  }

  private getTags(album: any): any[] {
    if (!Array.isArray(album?.tags)) {
      return [];
    }

    return album.tags
      .map((relation: any) => relation?.tag ?? relation)
      .filter((tag: any) => Boolean(tag?.slug));
  }

  private getCategorySlugs(album: any): string[] {
    if (!Array.isArray(album?.categories)) {
      return [];
    }

    const slugs = new Set<string>();
    for (const relation of album.categories) {
      const category = relation?.category ?? relation;
      if (category?.slug) {
        slugs.add(category.slug);
      }
      if (category?.parent?.slug) {
        slugs.add(category.parent.slug);
      }
    }

    return [...slugs];
  }

  private groupTagsByType(tags: any[]) {
    return tags.reduce(
      (grouped, tag) => {
        const type = tag.type || 'style';
        if (!grouped[type]) {
          grouped[type] = [];
        }
        grouped[type].push(tag.slug);
        return grouped;
      },
      {} as Record<string, string[]>,
    );
  }

  private countMatches(first: string[], second: string[]): number {
    const secondSet = new Set(second);
    return first.filter((item) => secondSet.has(item)).length;
  }

  private compareScoredAlbums(first: ScoredAlbum, second: ScoredAlbum): number {
    return (
      second.score - first.score ||
      this.getTimestamp(second.album.publishedAt) -
        this.getTimestamp(first.album.publishedAt) ||
      (second.album.viewCount ?? 0) - (first.album.viewCount ?? 0) ||
      String(first.album.id).localeCompare(String(second.album.id))
    );
  }

  private compareDiscoveryAlbums(
    first: ScoredAlbum,
    second: ScoredAlbum,
  ): number {
    return (
      this.getTimestamp(second.album.publishedAt) -
        this.getTimestamp(first.album.publishedAt) ||
      (second.album.viewCount ?? 0) - (first.album.viewCount ?? 0) ||
      String(first.album.id).localeCompare(String(second.album.id))
    );
  }

  private rotate<T>(items: T[], count: number, seed: number): T[] {
    if (items.length === 0 || count <= 0) {
      return [];
    }

    const start = seed % items.length;
    const result: T[] = [];
    const take = Math.min(count, items.length);

    for (let index = 0; index < take; index += 1) {
      result.push(items[(start + index) % items.length]);
    }

    return result;
  }

  private getTimestamp(value: unknown): number {
    const timestamp =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'string'
          ? Date.parse(value)
          : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private getRotationKey(date = new Date(Date.now())): string {
    const thursday = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = thursday.getUTCDay() || 7;
    thursday.setUTCDate(thursday.getUTCDate() + 4 - day);

    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );

    return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  private hashSeed(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return hash >>> 0;
  }

  /** Clear cached recommendations after album/category/tag changes. */
  clearCache(albumSlug?: string) {
    if (!albumSlug) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${albumSlug}:`)) {
        this.cache.delete(key);
      }
    }
  }
}
