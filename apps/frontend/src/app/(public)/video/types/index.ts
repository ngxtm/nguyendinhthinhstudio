export interface TikTokContent {
  id: string;
  url: string;
  title: string;
  type: string; // Custom type string thay vì limited union
  description?: string;
  category?: string;
  featured?: boolean;
}

export type MediaType = 'video' | 'photo'; // Để auto-detect từ URL
