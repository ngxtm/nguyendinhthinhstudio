import { TikTokContent } from '../types';

export const videoContentData: TikTokContent[] = [
  {
    id: '1',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/video/7531227572168920338?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Behind The Scenes - Studio Session',
    type: 'video1', // Custom type
    description: 'Hậu trường một buổi chụp ảnh tại studio',
    category: 'BTS',
    featured: true
  },
  {
    id: '2',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/photo/7536610904654368008?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Bộ Sưu Tập Ảnh Studio Concept',
    type: 'photo1', // Custom type
    description: 'Những khoảnh khắc đẹp nhất từ buổi chụp concept',
    category: 'Portfolio',
    featured: true
  },
  {
    id: '2.1',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/photo/7536610904654368008?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Bộ Sưu Tập Ảnh Studio Concept',
    type: 'photo1', // Custom type
    description: 'Những khoảnh khắc đẹp nhất từ buổi chụp concept',
    category: 'Portfolio',
    featured: true
  },
  {
    id: '2.2',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/photo/7536610904654368008?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Bộ Sưu Tập Ảnh Studio Concept',
    type: 'photo1', // Custom type
    description: 'Những khoảnh khắc đẹp nhất từ buổi chụp concept',
    category: 'Portfolio',
    featured: true
  },
  {
    id: '3',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/video/7484559239889816840?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Video BTS Chụp Cưới',
    type: 'video1', // Cùng type với video đầu tiên
    description: 'Behind the scenes buổi chụp cưới',
    category: 'Wedding',
    featured: false
  },
  {
    id: '4',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/photo/7535426507011902738?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Tutorial Tạo Dáng',
    type: 'video2', // Type khác
    description: 'Hướng dẫn tạo dáng chụp ảnh',
    category: 'Tutorial',
    featured: true
  },
  {
    id: '4',
    url: 'https://www.tiktok.com/@nguyendinhthinhstudio/video/7522692690752867602?is_from_webapp=1&sender_device=pc&web_id=7491330265144657415',
    title: 'Tutorial Tạo Dáng',
    type: 'video1', // Type khác
    description: 'Hướng dẫn tạo dáng chụp ảnh',
    category: 'Tutorial',
    featured: true
  }
];

// Utility functions for custom types
export const getContentByCustomType = (customType: string) => {
  return videoContentData.filter(item => item.type === customType);
};

export const getAllCustomTypes = () => {
  const types = videoContentData.map(item => item.type);
  return [...new Set(types)];
};

export const getContentGroupedByType = () => {
  const types = getAllCustomTypes();
  const grouped: { [key: string]: TikTokContent[] } = {};
  
  types.forEach(type => {
    grouped[type] = getContentByCustomType(type);
  });
  
  return grouped;
};

export const getFeaturedContent = () => {
  return videoContentData.filter(item => item.featured);
};

export const getContentByCategory = (category: string) => {
  return videoContentData.filter(item => item.category === category);
};

export const getAllCategories = () => {
  const categories = videoContentData
    .map(item => item.category)
    .filter((category): category is string => category !== undefined);
  return [...new Set(categories)];
};

// Helper function để tạo section title từ custom type
export const getTypeSectionTitle = (customType: string) => {
  const titleMap: { [key: string]: string } = {
    'video1': '🎬 Video BTS',
    'video2': '📹 Video Tutorial', 
    'photo1': '📸 Bộ Sưu Tập Ảnh',
    'photo2': '🖼️ Ảnh Portfolio',
    'bts': '🎭 Behind The Scenes',
    'portfolio': '💼 Portfolio',
    'tutorial': '📚 Tutorial'
  };
  
  return titleMap[customType.toLowerCase()] || `✨ ${customType}`;
};

// Helper function để lấy description cho mỗi custom type
export const getTypeDescription = (customType: string) => {
  const descriptionMap: { [key: string]: string } = {
    'video1': 'Video BTS là Video hậu trường kèm theo buổi chụp ảnh. Không tốn thêm thời gian nhưng lại có thêm những khoảnh khắc đáng sau bộ ảnh hoàn hảng, đẹp đẽ.',
    'video2': 'Video hướng dẫn và chia sẻ kinh nghiệm tạo dáng, chụp ảnh và các kỹ thuật khác trong studio.',
    'photo1': 'Bộ sưu tập ảnh concept đẹp mắt, thể hiện phong cách và cá tính riêng của mỗi khách hàng.',
    'photo2': 'Ảnh portfolio chuyên nghiệp cho các mục đích thương mại và cá nhân.',
    'bts': 'Những khoảnh khắc hậu trường thú vị trong quá trình sản xuất và chụp ảnh.',
    'portfolio': 'Tuyển tập những tác phẩm tiêu biểu và chất lượng nhất của studio.',
    'tutorial': 'Hướng dẫn và chia sẻ kiến thức về nhiếp ảnh và tạo dáng.'
  };
  
  return descriptionMap[customType.toLowerCase()] || 
    `Khám phá bộ sưu tập ${customType} với những nội dung đặc sắc và hấp dẫn.`;
};
