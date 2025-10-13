import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Seed tags with hierarchical structure
  const tags = [
    // Main Categories
    { name: 'Nữ', slug: 'nu', description: 'Chụp ảnh nữ', type: 'main_category', parentSlug: null },
    { name: 'Nam', slug: 'nam', description: 'Chụp ảnh nam', type: 'main_category', parentSlug: null },
    { name: 'Couple', slug: 'couple', description: 'Chụp ảnh couple', type: 'main_category', parentSlug: null },
    { name: 'Wedding', slug: 'wedding', description: 'Chụp ảnh cưới', type: 'main_category', parentSlug: null },
    { name: 'Mẹ bầu', slug: 'me-bau', description: 'Chụp ảnh bà bầu', type: 'main_category', parentSlug: null },
    { name: 'Mẹ và bé', slug: 'me-va-be', description: 'Chụp ảnh mẹ và bé', type: 'main_category', parentSlug: null },
    { name: 'Hậu trường', slug: 'hau-truong', description: 'Ảnh hậu trường', type: 'main_category', parentSlug: null },
    
    // Sub-categories for Nữ
    { name: 'Beauty', slug: 'beauty', description: 'Phong cách beauty', type: 'sub_category', parentSlug: 'nu' },
    { name: 'Birthday', slug: 'birthday', description: 'Ảnh sinh nhật', type: 'sub_category', parentSlug: 'nu' },
    { name: 'Thời trang', slug: 'thoi-trang', description: 'Phong cách thời trang', type: 'sub_category', parentSlug: 'nu' },
    { name: 'Tết - Thu - Trung', slug: 'tet-thu-trung', description: 'Ảnh dịp lễ', type: 'sub_category', parentSlug: 'nu' },
    { name: 'Công chúa nàng thơ', slug: 'cong-chua-nang-tho', description: 'Phong cách công chúa nàng thơ', type: 'sub_category', parentSlug: 'nu' },
    { name: 'Cosplay', slug: 'cosplay', description: 'Ảnh cosplay', type: 'sub_category', parentSlug: 'nu' },
    { name: 'Quyến rũ sexy', slug: 'quyen-ru-sexy', description: 'Phong cách quyến rũ', type: 'sub_category', parentSlug: 'nu' },
    
    // Styles (can be applied to any category)
    { name: 'Nàng thơ', slug: 'nang-tho', description: 'Phong cách nàng thơ, nhẹ nhàng', type: 'style', parentSlug: null },
    { name: 'Vintage', slug: 'vintage', description: 'Phong cách cổ điển, retro', type: 'style', parentSlug: null },
    { name: 'Hiện đại', slug: 'hien-dai', description: 'Phong cách hiện đại, tối giản', type: 'style', parentSlug: null },
    { name: 'Ngoại cảnh', slug: 'ngoai-canh', description: 'Chụp ngoài trời', type: 'style', parentSlug: null },
    { name: 'Studio', slug: 'studio', description: 'Chụp trong studio', type: 'style', parentSlug: null },
    
    // Locations
    { name: 'Nha Trang', slug: 'nha-trang', description: 'Địa điểm Nha Trang', type: 'location', parentSlug: null },
    { name: 'Hà Nội', slug: 'ha-noi', description: 'Địa điểm Hà Nội', type: 'location', parentSlug: null },
    { name: 'Đà Lạt', slug: 'da-lat', description: 'Địa điểm Đà Lạt', type: 'location', parentSlug: null },
    { name: 'Biển', slug: 'bien', description: 'Bối cảnh biển', type: 'location', parentSlug: null },
    { name: 'Sen', slug: 'sen', description: 'Bối cảnh sen', type: 'location', parentSlug: null },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
  }

  console.log(`✅ Seeded ${tags.length} tags successfully`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
