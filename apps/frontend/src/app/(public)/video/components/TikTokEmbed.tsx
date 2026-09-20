'use client';
import { useEffect } from 'react';
import { MediaType } from '../types';

interface TikTokEmbedProps {
  url: string;
  title: string;
  customType?: string; // Custom type từ user
  description?: string;
}

export const TikTokEmbed = ({ url, title, customType, description }: TikTokEmbedProps) => {
  useEffect(() => {
    // Load TikTok embed script only once
    if (!document.querySelector('script[src="https://www.tiktok.com/embed.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.tiktok.com/embed.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Auto detect media type from URL (video hoặc photo)
  const detectMediaType = (url: string): MediaType => {
    return url.includes('/photo/') ? 'photo' : 'video';
  };

  // Extract content ID from URL (works for both video and photo)
  const getContentId = (url: string) => {
    const videoMatch = url.match(/\/video\/(\d+)/);
    if (videoMatch) return videoMatch[1];
    
    const photoMatch = url.match(/\/photo\/(\d+)/);
    if (photoMatch) return photoMatch[1];
    
    return '';
  };

  // Clean URL by removing query parameters
  const cleanUrl = (url: string) => {
    return url.split('?')[0];
  };

  const mediaType = detectMediaType(url);
  const contentId = getContentId(url);
  const cleanedUrl = cleanUrl(url);

  // Function để lấy icon và color cho custom type
  const getTypeStyle = (customType?: string, mediaType?: MediaType) => {
    if (!customType) {
      return {
        icon: mediaType === 'photo' ? '📸' : '🎬',
        colorClass: mediaType === 'photo' 
          ? 'bg-purple-100 text-purple-800 border border-purple-200'
          : 'bg-blue-100 text-blue-800 border border-blue-200',
        text: mediaType === 'photo' ? 'Bộ sưu tập ảnh' : 'Video'
      };
    }

    // Custom colors cho các type khác nhau
    const typeColors: { [key: string]: string } = {
      'video1': 'bg-red-100 text-red-800 border border-red-200',
      'video2': 'bg-green-100 text-green-800 border border-green-200', 
      'photo1': 'bg-blue-100 text-blue-800 border border-blue-200',
      'photo2': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
      'bts': 'bg-purple-100 text-purple-800 border border-purple-200',
      'portfolio': 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      'behind-scenes': 'bg-pink-100 text-pink-800 border border-pink-200'
    };

    return {
      icon: mediaType === 'photo' ? '📸' : '🎬',
      colorClass: typeColors[customType.toLowerCase()] || 'bg-gray-100 text-gray-800 border border-gray-200',
      text: customType
    };
  };

  const typeStyle = getTypeStyle(customType, mediaType);

  return (
    <div className="mb-8 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <h3 className="text-lg font-semibold mb-4 text-center">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4">{description}</p>
      )}
      <div className="flex justify-center">
        <blockquote 
          className="tiktok-embed" 
          cite={cleanedUrl} 
          data-video-id={contentId}
          style={{ maxWidth: '605px', minWidth: '325px' }}
        >
          <section>
            <a 
              target="_blank" 
              href={cleanedUrl} 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 transition-colors"
            >
              {mediaType === 'photo' ? 'Xem bộ sưu tập ảnh trên TikTok' : 'Xem video trên TikTok'}
            </a>
          </section>
        </blockquote>
      </div>
      <div className="text-center mt-3">
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${typeStyle.colorClass}`}>
          {typeStyle.icon} {typeStyle.text}
        </span>
      </div>
    </div>
  );
};
