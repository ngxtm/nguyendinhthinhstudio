/**
 * Album Detail Page (Public) with Full SEO
 * Server Component with dynamic metadata + Client-side lightbox
 */

import { Metadata } from 'next';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { getAlbum, getRelatedAlbums, normalizeAlbumTags, normalizeAlbumCategories } from '../../../lib/api';
import AlbumDetailClient from './AlbumDetailClient';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Generate dynamic metadata for SEO
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const album = await getAlbum(slug, true); // Skip view increment for metadata

    const resolvedTags = normalizeAlbumTags(album.tags);
    const tagNames = resolvedTags.map((t) => t.name);
    const tagNamesString = tagNames.join(', ');
    const resolvedCategories = normalizeAlbumCategories(album.categories);
    const primaryCategory = resolvedCategories.find((cat) => cat.source === 'manual') || resolvedCategories[0] || null;
    const categoryName = primaryCategory?.name || '';

    // Build comprehensive description
    const description =
      album.metaDescription ||
      album.description ||
      `Xem bộ sưu tập ${album.title} với ${album.imageCount} ảnh chất lượng cao. ${
        categoryName ? `Thể loại: ${categoryName}.` : ''
      } ${tagNames.length ? `Tags: ${tagNamesString}.` : ''} Nhiếp ảnh chuyên nghiệp bởi NDT Studio.`;

    const title = album.metaTitle || `${album.title} | Thư viện ảnh NDT Studio`;

    // Get cover image for Open Graph
    const coverImageUrl = album.coverImage?.largeUrl || album.images?.[0]?.largeUrl;

    return {
      title,
      description,
      keywords: [
        album.title,
        categoryName,
        ...tagNames,
        'nhiếp ảnh',
        'chụp ảnh',
        'NDT Studio',
      ].join(', '),
      authors: [{ name: 'NDT Studio' }],
      creator: 'NDT Studio',
      publisher: 'NDT Studio',

      // Open Graph for Facebook
      openGraph: {
        title,
        description,
        type: 'article',
        url: `https://ndtstudio.com/thu-vien/${slug}`,
        siteName: 'NDT Studio',
        images: coverImageUrl
          ? [
              {
                url: coverImageUrl,
                width: 1920,
                height: 1080,
                alt: album.title,
              },
            ]
          : [],
        locale: 'vi_VN',
      },

      // Twitter Card
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: coverImageUrl ? [coverImageUrl] : [],
        creator: '@ndtstudio',
      },

      // Additional metadata
      robots: {
        index: album.status === 'published',
        follow: true,
        googleBot: {
          index: album.status === 'published',
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      },

      // Alternate languages (if you have multi-language support)
      alternates: {
        canonical: `https://ndtstudio.com/thu-vien/${slug}`,
      },
    };
  } catch (error) {
    return {
      title: 'Album không tìm thấy | NDT Studio',
      description: 'Album này không tồn tại hoặc đã bị xóa.',
    };
  }
}

/**
 * Server Component - Fetch data and pass to client
 */
export default async function AlbumDetailPage({ params }: Props) {
  const { slug } = await params;
  let album;
  let relatedAlbums;

  try {
    [album, relatedAlbums] = await Promise.all([
      getAlbum(slug),
      getRelatedAlbums(slug),
    ]);
  } catch (error) {
    notFound();
  }

  if (!album) {
    notFound();
  }

  const resolvedTags = normalizeAlbumTags(album.tags);
  const resolvedCategories = normalizeAlbumCategories(album.categories);
  const albumForClient = {
    ...album,
    tags: resolvedTags,
    categories: resolvedCategories,
    primaryCategory: resolvedCategories.find((cat) => cat.source === 'manual') || resolvedCategories[0] || null,
  };

  const relatedForClient = relatedAlbums.map((related) => {
    const relatedTags = normalizeAlbumTags(related.tags);
    const relatedCategories = normalizeAlbumCategories(related.categories);
    return {
      ...related,
      tags: relatedTags,
      categories: relatedCategories,
      primaryCategory: related.primaryCategory || relatedCategories.find((cat) => cat.source === 'manual') || null,
    };
  });

  // Generate JSON-LD structured data for Google
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: album.title,
    description: album.description || album.title,
    creator: {
      '@type': 'Organization',
      name: 'NDT Studio',
      url: 'https://ndtstudio.com',
    },
    datePublished: album.publishedAt,
    image: album.images?.map((img) => ({
      '@type': 'ImageObject',
      contentUrl: img.largeUrl,
      thumbnail: img.thumbnailUrl,
      width: img.width,
      height: img.height,
      caption: img.altText || album.title,
    })),
    associatedMedia: album.images?.map((img) => ({
      '@type': 'ImageObject',
      contentUrl: img.largeUrl,
      thumbnail: img.thumbnailUrl,
      width: img.width,
      height: img.height,
    })),
    keywords: resolvedTags.map((t) => t.name).join(', '),
    genre: albumForClient.primaryCategory?.name,
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/ViewAction',
      userInteractionCount: album.viewCount,
    },
  };

  // Generate BreadcrumbList for better SEO
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Trang chủ',
        item: 'https://ndtstudio.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Thư viện',
        item: 'https://ndtstudio.com/thu-vien',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: album.title,
        item: `https://ndtstudio.com/thu-vien/${slug}`,
      },
    ],
  };

  return (
    <>
      {/* Client Component handles interactivity */}
      <AlbumDetailClient album={albumForClient} relatedAlbums={relatedForClient} />

      {/* JSON-LD Structured Data for Google */}
      <Script
        id="image-gallery-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        strategy="beforeInteractive"
      />
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        strategy="beforeInteractive"
      />
    </>
  );
}
