import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AlbumScore {
  album: any;
  score: number;
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);
  private readonly cache = new Map<string, { data: any[]; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly MIN_SCORE_THRESHOLD = 40;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get related albums using smart recommendation algorithm with MMR
   * @param albumSlug Current album slug
   * @param limit Number of recommendations (default 12)
   */
  async getRelatedAlbums(albumSlug: string, limit: number = 12) {
    // Check cache first
    const cached = this.cache.get(albumSlug);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    // Get current album with tags
    const currentAlbum = await this.prisma.album.findUnique({
      where: { slug: albumSlug, status: 'published' },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        coverImage: true,
      },
    });

    if (!currentAlbum) {
      return [];
    }

    // Get all published albums except current
    const candidates = await this.prisma.album.findMany({
      where: {
        status: 'published',
        id: { not: currentAlbum.id },
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        coverImage: true,
      },
    });

    // Calculate scores for all candidates
    const scoredAlbums = candidates.map(candidate => ({
      album: candidate,
      score: this.calculateRelevanceScore(currentAlbum, candidate),
    }));

    // Filter by minimum threshold
    const qualifiedAlbums = scoredAlbums.filter(
      item => item.score >= this.MIN_SCORE_THRESHOLD
    );

    // Apply MMR (Maximal Marginal Relevance) for diversity
    const recommendations = this.applyMMR(qualifiedAlbums, limit);

    // If we don't have enough, add popular/newest albums
    if (recommendations.length < limit) {
      const fallbackCount = limit - recommendations.length;
      const fallbackAlbums = await this.getFallbackAlbums(
        fallbackCount,
        [...recommendations.map(r => r.album.id), currentAlbum.id]
      );
      recommendations.push(...fallbackAlbums.map(album => ({ album, score: 0 })));
    }

    // Format response
    const result = recommendations.map(({ album }) => ({
      id: album.id,
      title: album.title,
      slug: album.slug,
      category: album.category,
      coverImage: album.coverImage,
      viewCount: album.viewCount,
      imageCount: album.imageCount,
      tags: album.tags.map((at: any) => ({
        name: at.tag.name,
        slug: at.tag.slug,
        type: at.tag.type,
      })),
    }));

    // Cache results
    this.cache.set(albumSlug, { data: result, timestamp: Date.now() });

    return result;
  }

  /**
   * Calculate relevance score between two albums
   */
  private calculateRelevanceScore(currentAlbum: any, candidate: any): number {
    let score = 0;

    const currentTags = currentAlbum.tags.map((at: any) => at.tag);
    const candidateTags = candidate.tags.map((at: any) => at.tag);

    // Group tags by type
    const currentTagsByType = this.groupTagsByType(currentTags);
    const candidateTagsByType = this.groupTagsByType(candidateTags);

    // Sub-category match (+10 points per match)
    const subCategoryMatches = this.countMatches(
      currentTagsByType.sub_category || [],
      candidateTagsByType.sub_category || []
    );
    score += subCategoryMatches * 10;

    // Main category match (+5 points per match)
    const mainCategoryMatches = this.countMatches(
      currentTagsByType.main_category || [],
      candidateTagsByType.main_category || []
    );
    score += mainCategoryMatches * 5;

    // Style match (+3 points per match)
    const styleMatches = this.countMatches(
      currentTagsByType.style || [],
      candidateTagsByType.style || []
    );
    score += styleMatches * 3;

    // Location match (+1 point per match)
    const locationMatches = this.countMatches(
      currentTagsByType.location || [],
      candidateTagsByType.location || []
    );
    score += locationMatches * 1;

    // Category match (legacy field) (+3 points)
    if (currentAlbum.category === candidate.category) {
      score += 3;
    }

    // Popularity boost (view count)
    if (candidate.viewCount > 100) {
      score += Math.min(5, Math.floor(candidate.viewCount / 100));
    }

    return score;
  }

  /**
   * Apply Maximal Marginal Relevance for diversity
   */
  private applyMMR(scoredAlbums: AlbumScore[], limit: number): AlbumScore[] {
    const selected: AlbumScore[] = [];
    const remaining = [...scoredAlbums].sort((a, b) => b.score - a.score);

    while (selected.length < limit && remaining.length > 0) {
      // Re-calculate scores with diversity penalty
      const rescored = remaining.map(candidate => {
        let diversityPenalty = 0;

        // Count how many selected albums share sub-categories
        const candidateSubCategories = candidate.album.tags
          .filter((at: any) => at.tag.type === 'sub_category')
          .map((at: any) => at.tag.slug);

        for (const selectedItem of selected) {
          const selectedSubCategories = selectedItem.album.tags
            .filter((at: any) => at.tag.type === 'sub_category')
            .map((at: any) => at.tag.slug);

          const overlap = candidateSubCategories.filter((slug: string) =>
            selectedSubCategories.includes(slug)
          ).length;

          // Penalty: 5 points per shared sub-category
          diversityPenalty += overlap * 5;
        }

        return {
          ...candidate,
          finalScore: candidate.score - diversityPenalty,
        };
      });

      // Pick the highest scored
      rescored.sort((a, b) => b.finalScore - a.finalScore);
      const best = rescored[0];

      selected.push(best);
      const index = remaining.findIndex(r => r.album.id === best.album.id);
      remaining.splice(index, 1);
    }

    return selected;
  }

  /**
   * Get fallback albums (popular + newest)
   */
  private async getFallbackAlbums(count: number, excludeIds: string[]) {
    return this.prisma.album.findMany({
      where: {
        status: 'published',
        id: { notIn: excludeIds },
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        coverImage: true,
      },
      orderBy: [
        { viewCount: 'desc' },
        { publishedAt: 'desc' },
      ],
      take: count,
    });
  }

  /**
   * Group tags by type
   */
  private groupTagsByType(tags: any[]) {
    return tags.reduce((acc, tag) => {
      const type = tag.type || 'style';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(tag.slug);
      return acc;
    }, {} as Record<string, string[]>);
  }

  /**
   * Count matching elements between two arrays
   */
  private countMatches(arr1: string[], arr2: string[]): number {
    return arr1.filter(item => arr2.includes(item)).length;
  }

  /**
   * Clear cache (can be called periodically or after album updates)
   */
  clearCache(albumSlug?: string) {
    if (albumSlug) {
      this.cache.delete(albumSlug);
    } else {
      this.cache.clear();
    }
  }
}

