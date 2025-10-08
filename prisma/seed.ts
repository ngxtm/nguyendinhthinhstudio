import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Seed tags
  const tags = [
    { name: 'Nàng thơ', slug: 'nang-tho', description: 'Phong cách nàng thơ, nhẹ nhàng' },
    { name: 'Vintage', slug: 'vintage', description: 'Phong cách cổ điển, retro' },
    { name: 'Hiện đại', slug: 'hien-dai', description: 'Phong cách hiện đại, tối giản' },
    { name: 'Ngoại cảnh', slug: 'ngoai-canh', description: 'Chụp ngoài trời' },
    { name: 'Studio', slug: 'studio', description: 'Chụp trong studio' },
    { name: 'Nha Trang', slug: 'nha-trang', description: 'Địa điểm Nha Trang' },
    { name: 'Hà Nội', slug: 'ha-noi', description: 'Địa điểm Hà Nội' },
    { name: 'Đà Lạt', slug: 'da-lat', description: 'Địa điểm Đà Lạt' },
    { name: 'Biển', slug: 'bien', description: 'Bối cảnh biển' },
    { name: 'Sen', slug: 'sen', description: 'Bối cảnh sen' },
    { name: 'Nữ', slug: 'nu', description: 'Phong cách nữ' },
    { name: 'Nam', slug: 'nam', description: 'Phong cách nam' },
    { name: 'Couple', slug: 'couple', description: 'Phong cách couple' },
    { name: 'Family', slug: 'family', description: 'Phong cách family' },
    { name: 'Wedding', slug: 'wedding', description: 'Phong cách wedding' },
    { name: 'Birthday', slug: 'birthday', description: 'Phong cách birthday' },
    { name: 'Anniversary', slug: 'anniversary', description: 'Phong cách anniversary' },
    { name: 'Tết', slug: 'tet', description: 'Phong cách tết' },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
  }

  console.log('✅ Seeded 18 tags successfully');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
