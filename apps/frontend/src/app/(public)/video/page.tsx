'use client';
import NavigationLinks from "../../components/common/NavigationLinks";
import { TikTokEmbed } from './components';
import {
  getContentGroupedByType,
  getAllCustomTypes,
  getTypeSectionTitle,
  getTypeDescription
} from './data/video-content';

export default function Video() {
  // Lấy tất cả custom types và group content theo type
  const allTypes = getAllCustomTypes();
  const groupedContent = getContentGroupedByType();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 md:px-8 lg:px-16">
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">CONTENT COLLECTIONS</h1>

            {/* Navigation Links */}
            <div className="flex justify-center mt-6 mb-6">
              <NavigationLinks
                links={[
                  { label: 'Thư Viện Ảnh', href: '/thu-vien' },
                  { label: 'Bảng Giá Video', href: '/bang-gia/video' },
                  { label: 'Đặt Lịch', href: '/lien-he#ho-tro-nhanh' }
                ]}
                linkClassName="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                separatorClassName="text-gray-300"
              />
            </div>

            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Khám phá các bộ sưu tập nội dung được phân loại theo từng chủ đề riêng biệt. Mỗi loại mang một phong cách và mục đích khác nhau.
            </p>
          </div>

          {/* Dynamic Sections Based on Custom Types */}
          {allTypes.map((customType) => {
            const contentInType = groupedContent[customType];
            if (!contentInType || contentInType.length === 0) return null;

            return (
              <section key={customType} className="mb-16">
                <hr className="mb-8"/>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {getTypeSectionTitle(customType)}
                  </h2>
                  <p className="text-gray-600 max-w-6xl mx-auto text-sm md:text-base leading-relaxed">
                    {getTypeDescription(customType)}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {contentInType.map((content) => (
                    <TikTokEmbed 
                      key={content.id}
                      url={content.url}
                      title={content.title}
                      customType={content.type}
                      description={content.description}
                    />
                  ))}
                </div>
              </section>
            );
          })}


        </div>
      </div>
    </div>
  );
}