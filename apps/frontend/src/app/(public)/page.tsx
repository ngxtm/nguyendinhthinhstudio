import DividerWithText from '../components/common/DividerWithText'
import AppHero from '../components/layout/Hero'
import TwoLayoutSection from '../components/layout/TwoLayout'

import ServiceOverview from '../components/layout/ServiceOverview'
import AnimatedContent from '../components/common/AnimatedContent'
import SocialSection from '../components/common/SocialSection'
import OneLayoutSection from '../components/layout/OneLayout'
import { collectionImages } from '@/config/images'

export default function Home() {
  return (
    <div className="space-y-6 sm:space-y-8 md:space-y-10 lg:space-y-12">
      <AppHero />
      <div className="mt-6 sm:mt-8 md:mt-10">
        <OneLayoutSection imgSrc={collectionImages[0].src} title="NEW COLLECTION" titleButton="KHÁM PHÁ NGAY" buttonLink='/thu-vien' priority />
      </div>
      <AnimatedContent direction="horizontal" reverse={true} distance={800} duration={1.5} threshold={0.1}>
        <DividerWithText
          text="HOT & TRENDING"
          textClassName="text-[#cccccc] text-sm"
          className="mt-6 sm:mt-8 md:mt-10 px-6 md:px-16"
        />
      </AnimatedContent>
      <div className="space-y-6 sm:space-y-8 md:space-y-5">
        <TwoLayoutSection
          pic1src={collectionImages[1].src}
          pic1title="KHÁM PHÁ BỘ ẢNH"
          pic1titleButton="DỄ THƯƠNG"
          pic1ButtonLink="/thu-vien/nu/beauty"
          pic2src={collectionImages[3].src}
          pic2title="KHÁM PHÁ BỘ ẢNH"
          pic2titleButton="CÁ TÍNH"
          pic2ButtonLink="/thu-vien/quyen-ru-sexy"
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
          pic1ButtonLink="/thu-vien/wedding"
          pic2src={collectionImages[4].src}
          pic2title="KHÁM PHÁ BỘ ẢNH"
          pic2titleButton="NÀNG THƠ"
          pic2ButtonLink="/thu-vien/nu/cong-chua-nang-tho"
          pic1width={550}
          pic1height={800}
          pic2width={550}
          pic2height={800}
          containerGap={16}
          mobileStackVertical={true}
        />
      </div>
      <AnimatedContent direction="horizontal" distance={500} reverse={true} duration={1.5}>
        <DividerWithText text="FEATURED" textClassName="text-[#cccccc] text-sm" className="mt-6 sm:mt-8 md:mt-10 px-6 md:px-16" />
      </AnimatedContent>
      <AnimatedContent distance={200} direction="vertical" duration={1.5}>
        <OneLayoutSection imgSrc={collectionImages[5].src} title="READY TO SHOOT" titleButton="BOOKING NOW" buttonLink='/lien-he#ho-tro-nhanh'/>
      </AnimatedContent>
      <div className="space-y-6 sm:space-y-8">
        <ServiceOverview title1ButtonLink='/thu-vien'  title2ButtonLink='/lien-he#ho-tro-nhanh' title3ButtonLink='/gioi-thieu'/>
        <SocialSection />
      </div>
    </div>
  )
}
