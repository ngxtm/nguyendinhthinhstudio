import DividerWithText from '../components/common/DividerWithText'
import AppHero from '../components/layout/Hero'
import TwoLayoutSection from '../components/layout/TwoLayout'

import ServiceOverview from '../components/layout/ServiceOverview'
import AnimatedContent from '../components/common/AnimatedContent'
import SocialSection from '../components/common/SocialSection'
import OneLayoutSection from '../components/layout/OneLayout'
import { collectionImages } from '@/config/images'
import { createPublicMetadata } from '@/lib/seo'
import { categoryHref } from '@/lib/public-navigation'
import { getPublicCategorySlugs } from '@/lib/server/public-categories'

export const metadata = createPublicMetadata({
  title: 'Studio chụp ảnh tại Nha Trang | NDT Studio',
  description: 'Chụp ảnh cưới, gia đình, beauty và couple tại Nha Trang. Xem thư viện, bảng giá và liên hệ đặt lịch cùng NDT Studio.',
  path: '/'
})

export default async function Home() {
  const publicCategorySlugs = await getPublicCategorySlugs()

  return (
    <div className="space-y-6 sm:space-y-8 md:space-y-10 lg:space-y-12">
      <AppHero />
      <div className="mt-6 sm:mt-8 md:mt-10">
        <OneLayoutSection
          imgSrc={collectionImages[0].src}
          title="CHỤP ẢNH TẠI NHA TRANG"
          titleButton="KHÁM PHÁ NGAY"
          buttonLink="/thu-vien"
          priority
        />
      </div>
      <AnimatedContent direction="horizontal" reverse={true} distance={800} duration={1.5} threshold={0.1}>
        <DividerWithText
          text="HOT & TRENDING"
          textClassName="text-[#cccccc] text-sm"
          className="mt-6 px-6 sm:mt-8 md:mt-10 md:px-16"
        />
      </AnimatedContent>
      <div className="space-y-6 sm:space-y-8 md:space-y-5">
        <TwoLayoutSection
          pic1src={collectionImages[1].src}
          pic1title="KHÁM PHÁ BỘ ẢNH"
          pic1titleButton="DỄ THƯƠNG"
          pic1ButtonLink={categoryHref('beauty', publicCategorySlugs)}
          pic2src={collectionImages[3].src}
          pic2title="KHÁM PHÁ BỘ ẢNH"
          pic2titleButton="CÁ TÍNH"
          pic2ButtonLink={categoryHref('quyen-ru', publicCategorySlugs)}
          pic1width={550}
          pic1height={700}
          pic2width={550}
          pic2height={700}
          containerGap={16}
          mobileStackVertical={true}
        />
        <TwoLayoutSection
          pic1src={collectionImages[2].src}
          pic1title="KHÁM PHÁ BỘ ẢNH"
          pic1titleButton="WEEDING"
          pic1ButtonLink={categoryHref('wedding', publicCategorySlugs)}
          pic2src={collectionImages[4].src}
          pic2title="KHÁM PHÁ BỘ ẢNH"
          pic2titleButton="NÀNG THƠ"
          pic2ButtonLink={categoryHref('cong-chua', publicCategorySlugs)}
          pic1width={550}
          pic1height={800}
          pic2width={550}
          pic2height={800}
          containerGap={16}
          mobileStackVertical={true}
        />
      </div>
      <AnimatedContent direction="horizontal" distance={500} reverse={true} duration={1.5}>
        <DividerWithText
          text="FEATURED"
          textClassName="text-[#cccccc] text-sm"
          className="mt-6 px-6 sm:mt-8 md:mt-10 md:px-16"
        />
      </AnimatedContent>
      <AnimatedContent distance={200} direction="vertical" duration={1.5}>
        <OneLayoutSection
          imgSrc={collectionImages[5].src}
          title="READY TO SHOOT"
          titleButton="BOOKING NOW"
          buttonLink="/lien-he#ho-tro-nhanh"
        />
      </AnimatedContent>
      <div className="space-y-6 sm:space-y-8">
        <ServiceOverview
          title1ButtonLink="/thu-vien"
          title2ButtonLink="/lien-he#ho-tro-nhanh"
          title3ButtonLink="/gioi-thieu"
        />
        <SocialSection />
      </div>
    </div>
  )
}
