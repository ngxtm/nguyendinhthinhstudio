/**
 * Dynamic Sitemap for Albums
 * Generates sitemap.xml with all published albums
 */

import { MetadataRoute } from 'next';
import { getAlbums } from '@/app/lib/api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://ndtstudio.site';

  try {
    // Fetch all published albums
    const { data: albums } = await getAlbums({
      status: 'published',
      limit: 1000, // Get all albums
    });

    // Generate album URLs
    const albumUrls: MetadataRoute.Sitemap = albums.map((album) => ({
      url: `${baseUrl}/thu-vien/${album.slug}`,
      lastModified: album.updatedAt || album.publishedAt || new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
      {
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
      },
      {
        url: `${baseUrl}/gioi-thieu`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.8,
      },
      {
        url: `${baseUrl}/thu-vien`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.9,
      },
      {
        url: `${baseUrl}/video`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      },
      {
        url: `${baseUrl}/bang-gia`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.7,
      },
      {
        url: `${baseUrl}/lien-he`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.6,
      },
    ];

    return [...staticPages, ...albumUrls];
  } catch (error) {
    console.error('Error generating sitemap:', error);

    // Return at least static pages if album fetch fails
    return [
      {
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
      },
      {
        url: `${baseUrl}/thu-vien`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 0.9,
      },
    ];
  }
}
